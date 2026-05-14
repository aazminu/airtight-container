// Saved-reports API.
//
// This route persists `reports` rows (delivery sheet, I/O, P&L, S&H
// statement). On POST we run the per-type resolver, snapshot the
// resolved data into reports.resolved_data, and return the row. PDF
// rendering is a separate POST /:id/pdf call.

import express from "express";
import { desc, eq } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { reports } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createReportSchema } from "../../validation/report.js";
import { resolveReport } from "../../lib/report-resolvers/index.js";

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
			// Insert first so the resolver knows the report_id it should
			// stamp on the resolved data (delivery_id / report_id field on
			// the rendered template).
			const inserted = await drizzleDb
				.insert(reports)
				.values({
					report_type: req.body.report_type,
					parameters: req.body.parameters,
					emailed_to: req.body.emailed_to ?? null,
					generated_by: userId,
				})
				.returning();
			const row = inserted[0];
			try {
				const resolved = await resolveReport(
					row.report_type,
					row.parameters,
					row.id,
				);
				const updated = await drizzleDb
					.update(reports)
					.set({ resolved_data: resolved.data })
					.where(eq(reports.id, row.id))
					.returning();
				return res
					.status(201)
					.json({ status: "success", data: { report: updated[0] } });
			} catch (resolveErr) {
				// Bad params (e.g. unknown container_id) — roll the row
				// back so we don't leak half-resolved entries. Surface
				// the resolver's message so the form can show it.
				console.error("reports.resolve error:", resolveErr);
				await drizzleDb.delete(reports).where(eq(reports.id, row.id));
				return res.status(400).json({
					message:
						resolveErr instanceof Error
							? resolveErr.message
							: "Could not resolve report data",
				});
			}
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
