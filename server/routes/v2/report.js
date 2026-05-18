// Saved-reports API.
//
// This route persists `reports` rows (delivery sheet, I/O, P&L, S&H
// statement). On POST we run the per-type resolver, snapshot the
// resolved data into reports.resolved_data, and return the row. PDF
// rendering is a separate POST /:id/pdf call.

import express from "express";
import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { Resend } from "resend";
import { db as drizzleDb } from "../../db/drizzle.js";
import db from "../../db/index.js";
import { reports, report_receipt_links } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createReportSchema } from "../../validation/report.js";
import { resolveReport } from "../../lib/report-resolvers/index.js";
import {
	renderAndStoreReportPdf,
	getReportPdfBytes,
} from "../../lib/report-pdf.js";
import { deleteObject } from "../../lib/s3.js";
import { isSmsConfigured, sendSms, toE164 } from "../../lib/sms.js";
import { applyOutboundFromDeliverySheets } from "../../lib/outbound-from-delivery.js";

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
	release_summary: {
		subject: (data) =>
			`Release summary — ${data?.release_number_value ?? "release"} (${
				data?.sale_company_name ?? "company"
			})`,
		body: "Your release summary is attached.",
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

// Preview a report's resolved data without persisting a row. Used by
// the multi-step generator forms (delivery sheet, etc.) to render the
// in-progress template on the Preview step. Same validation as create,
// same resolver, just no insert + delete dance.
router.post(
	"/preview",
	checkEmployee,
	validateBody(createReportSchema),
	async (req, res) => {
		try {
			const resolved = await resolveReport(
				req.body.report_type,
				req.body.parameters,
				0,
			);
			res.status(200).json({
				status: "success",
				data: {
					report_type: resolved.report_type,
					resolved_data: resolved.data,
				},
			});
		} catch (err) {
			console.error("reports.preview error:", err);
			res.status(400).json({
				message:
					err instanceof Error ? err.message : "Could not resolve preview",
			});
		}
	},
);

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
				// PR 9.7: if this is a delivery sheet whose date is now
				// in the past, flip the linked container to 'outbound'.
				// Sales path only — sh_box_id reports are skipped by the
				// helper. Non-fatal — log and continue; the daily cron
				// catches anything this missed.
				if (row.report_type === "delivery_sheet") {
					const cid = row.parameters?.container_id;
					if (Number.isInteger(cid)) {
						try {
							await applyOutboundFromDeliverySheets({ containerId: cid });
						} catch (e) {
							console.error("reports.create outbound-flip error:", e);
						}
					}
				}
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
		// PR 9.7: re-check outbound state after a regenerate. The
		// operator may have edited the delivery_date forward or
		// backward; we only flip sold → outbound (one-way), so a
		// forward edit that moves the date past today still triggers
		// correctly, and a date pushed into the future on an already-
		// outbound row stays outbound.
		if (row.report_type === "delivery_sheet") {
			const cid = row.parameters?.container_id;
			if (Number.isInteger(cid)) {
				try {
					await applyOutboundFromDeliverySheets({ containerId: cid });
				} catch (e) {
					console.error("reports.regenerate outbound-flip error:", e);
				}
			}
		}
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

// PR 9.6: send the delivery-sheet receipt link to the driver by SMS.
//
// Gated to report_type='delivery_sheet' so a stray token can never
// surface a P&L or other internal report via the public /r/:token
// route. Each send mints a fresh token (old ones stay valid until
// 30-day expiry) so a re-send to a corrected number doesn't accidentally
// expose the receipt to the original wrong recipient.
//
// SMS body is kept PII-free — "Airtight Container: Delivery sheet
// for {unit}. <link>" — so a wrong-number mis-send leaks only a
// generic phrase, not the client name or address.
//
// Returns 503 when Twilio isn't configured (env vars missing) so the
// UI can show a clear "Twilio not set up yet" message instead of a
// generic 500.
const PUBLIC_BASE_URL =
	process.env.PUBLIC_BASE_URL || "https://airtightshippingcontainer.com";

router.post("/:id/sms", checkAdmin, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}

		if (!isSmsConfigured()) {
			return res.status(503).json({
				message:
					"SMS sending is not configured on this server. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.",
			});
		}

		const rows = await drizzleDb
			.select()
			.from(reports)
			.where(eq(reports.id, id));
		if (rows.length === 0) {
			return res.status(404).json({ message: "Report not found" });
		}
		const row = rows[0];
		if (row.report_type !== "delivery_sheet") {
			return res
				.status(409)
				.json({ message: "SMS is only supported for delivery sheets" });
		}
		if (!row.resolved_data) {
			return res
				.status(400)
				.json({ message: "Report has no resolved data" });
		}
		// PDF must already exist (or be regenerable) — the SMS body
		// links to it. Lazy-render if missing, same pattern as /email.
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
				.set({ pdf_s3_key: pdfKey, pdf_generated_at: new Date() })
				.where(eq(reports.id, row.id));
		}

		// Pull phone from body (operator may override at send time) or
		// fall back to the snapshot. Normalize to E.164 — Twilio rejects
		// anything else.
		const rawTo =
			(typeof req.body?.to === "string" && req.body.to.trim()) ||
			row.resolved_data?.driver_contact?.phone ||
			null;
		if (!rawTo) {
			return res.status(400).json({
				message:
					"No driver phone on file. Provide one in the request body or capture it on the delivery sheet.",
			});
		}
		const to = toE164(rawTo);

		// 16 bytes = 128 bits of entropy = brute-force-proof against
		// rate-limited token enumeration. base64url so the token is
		// URL-safe without escaping.
		const token = crypto.randomBytes(16).toString("base64url");
		await drizzleDb.insert(report_receipt_links).values({
			token,
			report_id: row.id,
			// expires_at defaults to NOW() + 30 days at the DB level
			// via the column default; insert nothing here so it
			// applies.
			expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
		});

		const unitNumber =
			row.resolved_data?.container?.unit_number?.trim?.() || "your container";
		const body =
			`Airtight Container: Delivery sheet for ${unitNumber} is ready. ` +
			`View: ${PUBLIC_BASE_URL}/r/${token} ` +
			`Reply STOP to opt out, HELP for help.`;

		const sendResult = await sendSms({ to, body });

		await drizzleDb
			.update(reports)
			.set({ sms_sent_at: new Date() })
			.where(eq(reports.id, row.id));

		return res.status(200).json({
			status: "success",
			to,
			token,
			sms_sid: sendResult.sid,
			sms_status: sendResult.status,
		});
	} catch (err) {
		// Twilio surfaces friendly messages on .message — surface them
		// to the operator UI (so "this number isn't in your verified
		// list" reaches the user during trial mode).
		console.error("reports.sms error:", err);
		return res
			.status(502)
			.json({ message: err.message || "SMS send failed" });
	}
});

// PR 9.6: manually revoke an outstanding receipt link. Admin can use
// this from the ReportDetail UI when a wrong number was used; the link
// stays in the DB for the audit trail but stops resolving immediately.
router.post("/:id/revoke-receipt-link", checkAdmin, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}
		const token =
			typeof req.body?.token === "string" && req.body.token.trim();
		if (!token) {
			return res.status(400).json({ message: "token is required" });
		}
		const result = await db.query(
			`UPDATE report_receipt_links
			    SET revoked_at = NOW()
			  WHERE token = $1 AND report_id = $2 AND revoked_at IS NULL
			  RETURNING token, revoked_at`,
			[token, id],
		);
		if (result.rows.length === 0) {
			return res
				.status(404)
				.json({ message: "Token not found or already revoked" });
		}
		return res.status(200).json({ status: "success", data: result.rows[0] });
	} catch (err) {
		console.error("reports.revoke-receipt-link error:", err);
		return res
			.status(500)
			.json({ message: err.message || "Internal server error" });
	}
});

// Hard delete: drops the row AND the S3 PDF. Unlike invoices (which
// keep PDFs on delete for the financial audit trail), reports are
// operational artifacts — once the row is gone there's no FK pointing
// at the PDF, so leaving it in S3 is just orphan junk.
//
// S3 cleanup is best-effort: if the SDK call fails we still report
// success on the row delete. The DB is the source of truth; the
// orphan is recoverable manually.
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}
		const deleted = await drizzleDb
			.delete(reports)
			.where(eq(reports.id, id))
			.returning({ id: reports.id, pdf_s3_key: reports.pdf_s3_key });
		if (deleted.length === 0) {
			return res.status(404).json({ message: "Report not found" });
		}
		const pdfKey = deleted[0].pdf_s3_key;
		if (pdfKey) {
			try {
				await deleteObject(pdfKey);
			} catch (s3Err) {
				console.error(
					`reports.delete: row ${deleted[0].id} dropped but S3 cleanup failed for ${pdfKey}:`,
					s3Err,
				);
			}
		}
		res.status(200).json({ status: "success", data: { id: deleted[0].id } });
	} catch (err) {
		console.error("reports.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
