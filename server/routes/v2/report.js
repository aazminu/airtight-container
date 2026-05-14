// Saved-reports API (Phase 5 PR 5.1).
//
// This route persists `reports` rows (delivery sheet, I/O, P&L, S&H
// statement). PDF generation lands in PR 5.2 once the brand-consistent
// templates exist. For now POST persists the parameters and returns the
// new row; pdf_s3_key stays null until a follow-up POST /:id/pdf call
// renders the document. The list + detail + delete endpoints are
// usable immediately.

import express from "express";
import { desc, eq } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { reports } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createReportSchema } from "../../validation/report.js";

const router = express.Router();

router.get("/", checkEmployee, async (req, res) => {
	try {
		const typeFilter = req.query.report_type;
		const rows = await drizzleDb
			.select()
			.from(reports)
			.where(typeFilter ? eq(reports.report_type, String(typeFilter)) : undefined)
			.orderBy(desc(reports.generated_at));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { reports: rows },
		});
	} catch (err) {
		console.error("reports.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}
		const rows = await drizzleDb
			.select()
			.from(reports)
			.where(eq(reports.id, id));
		if (rows.length === 0) {
			return res.status(404).json({ message: "Report not found" });
		}
		res.status(200).json({ status: "success", data: { report: rows[0] } });
	} catch (err) {
		console.error("reports.get error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(createReportSchema),
	async (req, res) => {
		try {
			// generated_by: the Better Auth user id from the session, if any.
			// Reports survive a user deletion via the ON DELETE SET NULL FK,
			// so persisting null when the session has no user is fine too.
			const userId = req.user?.id ?? null;
			const inserted = await drizzleDb
				.insert(reports)
				.values({
					report_type: req.body.report_type,
					parameters: req.body.parameters,
					emailed_to: req.body.emailed_to ?? null,
					generated_by: userId,
				})
				.returning();
			res
				.status(201)
				.json({ status: "success", data: { report: inserted[0] } });
		} catch (err) {
			console.error("reports.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}
		const deleted = await drizzleDb
			.delete(reports)
			.where(eq(reports.id, id))
			.returning({ id: reports.id });
		if (deleted.length === 0) {
			return res.status(404).json({ message: "Report not found" });
		}
		res.status(200).json({ status: "success", data: { id: deleted[0].id } });
	} catch (err) {
		console.error("reports.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
