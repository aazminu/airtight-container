// Saved-reports API.
//
// This route persists `reports` rows (delivery sheet, I/O, P&L, S&H
// statement). On POST we run the per-type resolver, snapshot the
// resolved data into reports.resolved_data, and return the row. PDF
// rendering is a separate POST /:id/pdf call.

import express from "express";
import { desc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { db as drizzleDb } from "../../db/drizzle.js";
import db from "../../db/index.js";
import { reports } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createReportSchema } from "../../validation/report.js";
import { resolveReport } from "../../lib/report-resolvers/index.js";
import {
	renderAndStoreReportPdf,
	getReportPdfBytes,
} from "../../lib/report-pdf.js";

const router = express.Router();

// Default subject + body language per report_type. Operator can still
// override the recipient list at email-send time; body text is fixed
// (Resend won't allow form fields in the prod path).
const EMAIL_COPY = {
	delivery_sheet: {
		subject: (data) =>
			`Delivery sheet — ${
				data?.container?.unit_number?.trim?.() ?? "container"
			}`,
		body: "Your delivery sheet is attached.",
	},
	io_report: {
		subject: (data) =>
			`In / Out report — ${data?.start_date ?? ""} to ${data?.end_date ?? ""}`,
		body: "Your inbound/outbound report is attached.",
	},
	pnl: {
		subject: (data) => `Profit + Loss — ${data?.period_label ?? "period"}`,
		body: "Your P&L report is attached.",
	},
	sh_statement: {
		subject: (data) =>
			`S&H statement — ${
				data?.client?.business_name ?? data?.client?.client_name ?? "client"
			}`,
		body: "Your S&H statement is attached.",
	},
};

// BCC the operator's logging mailboxes on every outbound report (same
// pattern the invoice email route uses).
const SEND_BCC = ["vagabond7257@gmail.com", "hlynch02@tufts.edu"];

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

// Re-run the resolver against current DB state. Use when the operator
// fixes a typo in the underlying invoice/client and wants the saved
// report to reflect the correction.
router.post("/:id/regenerate", checkAdmin, async (req, res) => {
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
		const row = rows[0];
		const resolved = await resolveReport(
			row.report_type,
			row.parameters,
			row.id,
		);
		// Bust the cached PDF — the stored bytes are now stale.
		const updated = await drizzleDb
			.update(reports)
			.set({
				resolved_data: resolved.data,
				pdf_s3_key: null,
				pdf_generated_at: null,
			})
			.where(eq(reports.id, row.id))
			.returning();
		res.status(200).json({ status: "success", data: { report: updated[0] } });
	} catch (err) {
		console.error("reports.regenerate error:", err);
		res
			.status(500)
			.json({ message: err.message || "Internal server error" });
	}
});

// Render + store the PDF. Idempotent — re-running re-renders the same
// resolved_data snapshot and overwrites the S3 object.
router.post("/:id/pdf", checkAdmin, async (req, res) => {
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
		const row = rows[0];
		if (!row.resolved_data) {
			return res.status(400).json({
				message:
					"Report has no resolved data. Try /regenerate first.",
			});
		}
		const result = await renderAndStoreReportPdf(
			row.id,
			row.report_type,
			row.resolved_data,
		);
		const updated = await drizzleDb
			.update(reports)
			.set({
				pdf_s3_key: result.s3Key,
				pdf_generated_at: new Date(),
			})
			.where(eq(reports.id, row.id))
			.returning();
		res.status(200).json({
			status: "success",
			data: { report: updated[0] },
			s3Key: result.s3Key,
			bytes: result.bytes,
		});
	} catch (err) {
		console.error("reports.pdf error:", err);
		res
			.status(500)
			.json({ message: err.message || "Internal server error" });
	}
});

// Stream the cached PDF back. Regenerates on the fly if pdf_s3_key is
// missing — keeps the client path simple (one GET works regardless of
// prior state).
router.get("/:id/pdf", checkEmployee, async (req, res) => {
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
		const row = rows[0];
		if (!row.resolved_data) {
			return res
				.status(400)
				.json({ message: "Report has no resolved data" });
		}
		let pdfKey = row.pdf_s3_key;
		if (!pdfKey) {
			const result = await renderAndStoreReportPdf(
				row.id,
				row.report_type,
				row.resolved_data,
			);
			pdfKey = result.s3Key;
			await drizzleDb
				.update(reports)
				.set({
					pdf_s3_key: pdfKey,
					pdf_generated_at: new Date(),
				})
				.where(eq(reports.id, row.id));
		}
		const bytes = await getReportPdfBytes(pdfKey);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`inline; filename="report-${row.id}.pdf"`,
		);
		res.send(bytes);
	} catch (err) {
		console.error("reports.pdfStream error:", err);
		res
			.status(500)
			.json({ message: err.message || "Internal server error" });
	}
});

// Email the PDF to the addresses passed in `to` (single string or
// array). Regenerates the PDF first if missing. Stamps emailed_at +
// merges the recipient list into emailed_to.
router.post("/:id/email", checkAdmin, async (req, res) => {
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
		const row = rows[0];
		const raw = req.body?.to;
		const toList = Array.isArray(raw) ? raw : raw ? [raw] : [];
		const trimmed = toList
			.map((s) => (typeof s === "string" ? s.trim() : ""))
			.filter(Boolean);
		if (trimmed.length === 0) {
			return res
				.status(400)
				.json({ message: "At least one recipient is required" });
		}
		if (!row.resolved_data) {
			return res
				.status(400)
				.json({ message: "Report has no resolved data" });
		}
		let pdfKey = row.pdf_s3_key;
		if (!pdfKey) {
			const result = await renderAndStoreReportPdf(
				row.id,
				row.report_type,
				row.resolved_data,
			);
			pdfKey = result.s3Key;
			await drizzleDb
				.update(reports)
				.set({
					pdf_s3_key: pdfKey,
					pdf_generated_at: new Date(),
				})
				.where(eq(reports.id, row.id));
		}
		const pdfBytes = await getReportPdfBytes(pdfKey);

		const copy = EMAIL_COPY[row.report_type];
		if (!copy) {
			return res
				.status(400)
				.json({ message: `Unsupported report_type: ${row.report_type}` });
		}
		const subject = copy.subject(row.resolved_data);
		const resend = new Resend(process.env.RESEND);
		const filename = `${row.report_type.replace(/_/g, "-")}-${row.id}.pdf`;
		const { data, error } = await resend.emails.send({
			from: "Michelle <michelle@airtightstorage.com>",
			to: trimmed,
			bcc: SEND_BCC,
			subject,
			html: `<p>${copy.body}</p><p>— Airtight Storage Systems</p>`,
			attachments: [
				{
					filename,
					content: pdfBytes.toString("base64"),
				},
			],
		});
		if (error) {
			console.error("reports.email resend error:", error);
			return res
				.status(502)
				.json({ message: error.message ?? "Resend failure" });
		}
		// Merge into emailed_to + stamp emailed_at.
		const existing = Array.isArray(row.emailed_to) ? row.emailed_to : [];
		const merged = Array.from(new Set([...existing, ...trimmed]));
		const updated = await drizzleDb
			.update(reports)
			.set({ emailed_to: merged, emailed_at: new Date() })
			.where(eq(reports.id, row.id))
			.returning();
		res.status(200).json({
			status: "success",
			data: { report: updated[0] },
			message_id: data?.id,
		});
	} catch (err) {
		console.error("reports.email error:", err);
		res
			.status(500)
			.json({ message: err.message || "Internal server error" });
	}
});

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
