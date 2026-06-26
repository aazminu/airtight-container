import express from "express";
import db from "../../db/index.js";
import pool from "../../db/pool.js";
import { Resend } from "resend";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	createQuoteSchema,
	updateQuoteSchema,
	emailQuoteSchema,
	promoteQuoteSchema,
} from "../../validation/quote.js";
import {
	createQuote,
	updateQuoteFull,
	deleteQuote,
	promoteQuoteToInvoice,
} from "../../lib/quote-ops.js";
import {
	renderAndStoreQuotePdf,
	getQuotePdfBytes,
} from "../../lib/quote-pdf.js";

const router = express.Router();

// Assemble the quote tree (quote fields + customer + lines + per-line
// mods) from a flat list query result. One row per (quote × line);
// quotes with zero lines produce a single row with line_id = null.
const groupQuotes = (rows) => {
	const acc = [];
	for (const row of rows) {
		let quote = acc.find((q) => q.id === row.id);
		if (!quote) {
			quote = {
				id: row.id,
				quote_number: row.quote_number,
				quote_taxed: row.quote_taxed,
				quote_credit: row.quote_credit,
				created_at: row.created_at,
				notes: row.notes,
				status: row.status,
				pdf_s3_key: row.pdf_s3_key,
				sent_at: row.sent_at,
				deleted_at: row.deleted_at,
				subtotal: row.subtotal,
				tax_rate: row.tax_rate,
				tax_amount: row.tax_amount,
				cc_fee_rate: row.cc_fee_rate,
				cc_fee_amount: row.cc_fee_amount,
				total: row.total,
				customer: {
					id: row.client_id,
					client_name: row.client_name,
					business_name: row.business_name,
					contact_email: row.contact_email,
					contact_phone: row.contact_phone,
					street: row.street,
					city: row.city,
					state: row.client_state,
					zip: row.zip,
				},
				lines: [],
			};
			acc.push(quote);
		}
		if (row.line_id != null) {
			quote.lines.push({
				id: row.line_id,
				description: row.line_description,
				sale_price: row.sale_price,
				trucking_rate: row.trucking_rate,
				destination: row.destination,
				position: row.line_position,
				modifications: [],
			});
		}
	}
	return acc;
};

// One IN-list query fetches every modification for the lines we just
// grouped. Mutates the input array in place.
const attachQuoteMods = async (quotes) => {
	const lineIds = quotes
		.flatMap((q) => q.lines.map((l) => l.id))
		.filter((id) => id != null);
	if (lineIds.length === 0) return;
	const { rows } = await db.query(
		`SELECT id, quote_line_item_id, description, price, quantity, position
		 FROM quote_line_modifications
		 WHERE quote_line_item_id = ANY($1::int[])
		 ORDER BY quote_line_item_id, position, id`,
		[lineIds],
	);
	const byLine = new Map();
	for (const row of rows) {
		if (!byLine.has(row.quote_line_item_id))
			byLine.set(row.quote_line_item_id, []);
		byLine.get(row.quote_line_item_id).push(row);
	}
	for (const q of quotes) {
		for (const l of q.lines) {
			l.modifications = byLine.get(l.id) ?? [];
		}
	}
};

const QUOTE_SELECT_COLS = `
	q.id, q.quote_number, q.quote_taxed, q.quote_credit, q.created_at, q.notes,
	q.status, q.pdf_s3_key, q.sent_at, q.deleted_at, q.client_id,
	q.subtotal, q.tax_rate, q.tax_amount, q.cc_fee_rate, q.cc_fee_amount, q.total,
	cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
	cl.street, cl.city, cl.state AS client_state, cl.zip,
	li.id AS line_id, li.description AS line_description, li.sale_price,
	li.trucking_rate, li.destination, li.position AS line_position
`;

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${QUOTE_SELECT_COLS}
			 FROM quotes q
			 JOIN clients cl ON q.client_id = cl.id
			 LEFT JOIN quote_line_items li ON q.id = li.quote_id
			 ORDER BY q.id DESC, li.position`,
		);
		const grouped = groupQuotes(results.rows);
		await attachQuoteMods(grouped);
		res.status(200).json({
			status: "success",
			results: grouped.length,
			data: { quotes: grouped },
		});
	} catch (err) {
		console.error("quote.get error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${QUOTE_SELECT_COLS}
			 FROM quotes q
			 JOIN clients cl ON q.client_id = cl.id
			 LEFT JOIN quote_line_items li ON q.id = li.quote_id
			 WHERE q.id = $1
			 ORDER BY li.position`,
			[req.params.id],
		);
		const grouped = groupQuotes(results.rows);
		await attachQuoteMods(grouped);
		res.status(200).json({
			status: "success",
			results: grouped.length,
			data: { quotes: grouped },
		});
	} catch (err) {
		console.error("quote.getOne error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/", checkEmployee, validateBody(createQuoteSchema), async (req, res) => {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await createQuote(client, req.body);
		await client.query("COMMIT");
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("quote.post error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	} finally {
		client.release();
	}
});

// Look up a quote's deleted_at without the full join. `undefined` means
// the row doesn't exist (404 vs. tombstoned disambiguation).
const getDeletedAt = async (quoteId) => {
	const { rows } = await db.query(
		"SELECT deleted_at FROM quotes WHERE id = $1",
		[quoteId],
	);
	if (rows.length === 0) return undefined;
	return rows[0].deleted_at;
};

router.put("/:id", checkAdmin, validateBody(updateQuoteSchema), async (req, res) => {
	const quoteId = parseInt(req.params.id, 10);
	if (!Number.isFinite(quoteId)) {
		return res.status(400).json({ message: "Invalid quote id" });
	}
	const deletedAt = await getDeletedAt(quoteId);
	if (deletedAt === undefined) {
		return res.status(404).json({ message: "Not found" });
	}
	if (deletedAt !== null) {
		return res.status(409).json({ message: "Quote is deleted" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await updateQuoteFull(client, quoteId, req.body);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("quote.put error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	} finally {
		client.release();
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	const quoteId = parseInt(req.params.id, 10);
	if (!Number.isFinite(quoteId)) {
		return res.status(400).json({ message: "Invalid quote id" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await deleteQuote(client, quoteId);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("quote.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	} finally {
		client.release();
	}
});

// Render the quote's PDF via headless Chromium, store to S3 at
// quotes/<id>.pdf, and cache the key. Idempotent.
router.post("/:id/pdf", checkAdmin, async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		if (!Number.isFinite(id)) {
			return res.status(400).json({ message: "Invalid quote id" });
		}
		const deletedAt = await getDeletedAt(id);
		if (deletedAt === undefined) {
			return res.status(404).json({ message: "Not found" });
		}
		if (deletedAt !== null) {
			return res.status(409).json({ message: "Quote is deleted" });
		}
		const result = await renderAndStoreQuotePdf(id);
		await db.query("UPDATE quotes SET pdf_s3_key = $1 WHERE id = $2", [
			result.s3Key,
			id,
		]);
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		console.error("quote.pdf error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

// Re-render fresh, refresh the cached S3 object, then stream the PDF back
// as an attachment. No email is sent. Mirrors invoice GET /:id/pdf.
router.get("/:id/pdf", checkAdmin, async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!Number.isFinite(id)) {
		return res.status(400).json({ message: "Invalid quote id" });
	}
	try {
		const { rows } = await db.query(
			"SELECT quote_number, deleted_at FROM quotes WHERE id = $1",
			[id],
		);
		const quote = rows[0];
		if (!quote) return res.status(404).json({ message: "Not found" });
		if (quote.deleted_at !== null) {
			return res.status(409).json({ message: "Quote is deleted" });
		}
		const { s3Key } = await renderAndStoreQuotePdf(id);
		await db.query("UPDATE quotes SET pdf_s3_key = $1 WHERE id = $2", [
			s3Key,
			id,
		]);
		const pdfBytes = await getQuotePdfBytes(s3Key);
		res.status(200);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="quote-${quote.quote_number}.pdf"`,
		);
		res.setHeader("Content-Length", pdfBytes.length);
		res.end(pdfBytes);
	} catch (err) {
		console.error("quote.pdf.download error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

const SEND_BCC = (process.env.SEND_BCC ?? "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

const escapeHtml = (s) =>
	String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

// Send the current quote PDF to the customer (regenerating if absent)
// and stamp sent_at + status='sent'. Mirrors invoice email, but the
// subject/body say "Quote" and there's no AR lifecycle to advance.
router.post("/:id/email", checkAdmin, validateBody(emailQuoteSchema), async (req, res) => {
	const quoteId = parseInt(req.params.id, 10);
	if (!Number.isFinite(quoteId)) {
		return res.status(400).json({ message: "Invalid quote id" });
	}
	try {
		const { rows } = await db.query(
			`SELECT q.quote_number, q.pdf_s3_key, q.deleted_at, cl.contact_email, cl.client_name
			 FROM quotes q
			 JOIN clients cl ON q.client_id = cl.id
			 WHERE q.id = $1`,
			[quoteId],
		);
		const quote = rows[0];
		if (!quote) return res.status(404).json({ message: "Not found" });
		if (quote.deleted_at !== null) {
			return res.status(409).json({ message: "Quote is deleted" });
		}
		const to = req.body?.to ?? quote.contact_email;
		if (!to)
			return res.status(400).json({ message: "No recipient email on file" });

		let pdfKey = quote.pdf_s3_key;
		if (!pdfKey) {
			const result = await renderAndStoreQuotePdf(quoteId);
			pdfKey = result.s3Key;
			await db.query("UPDATE quotes SET pdf_s3_key = $1 WHERE id = $2", [
				pdfKey,
				quoteId,
			]);
		}

		const pdfBytes = await getQuotePdfBytes(pdfKey);
		const resend = new Resend(process.env.RESEND);
		const subject = `Quote ${quote.quote_number} from Airtight Storage Systems`;
		const html = `<p>Hi ${escapeHtml(quote.client_name)},</p>
			<p>Your quote <strong>${escapeHtml(quote.quote_number)}</strong> is attached.</p>
			<p>Thank you,<br/>Airtight Storage Systems</p>`;
		const { data, error } = await resend.emails.send({
			from: "Michelle <michelle@airtightstorage.com>",
			to: [to],
			bcc: SEND_BCC,
			subject,
			html,
			attachments: [
				{
					filename: `quote-${quote.quote_number}.pdf`,
					content: pdfBytes.toString("base64"),
				},
			],
		});
		if (error) {
			console.error("quote.email resend error:", error);
			return res.status(502).json({ message: error.message ?? "Resend failure" });
		}
		await db.query(
			"UPDATE quotes SET sent_at = NOW(), status = 'sent' WHERE id = $1",
			[quoteId],
		);
		res.status(200).json({ status: "success", message_id: data?.id });
	} catch (err) {
		console.error("quote.email error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

// Spawn a new sales invoice from this quote's client + line pricing,
// applied to the chosen containers. The quote is left intact (can be
// promoted again). Line→container mapping is positional unless the body
// pins containers to lines via line_id (see lib/quote-ops promoteQuoteToInvoice).
router.post(
	"/:id/promote",
	checkAdmin,
	validateBody(promoteQuoteSchema),
	async (req, res) => {
		const quoteId = parseInt(req.params.id, 10);
		if (!Number.isFinite(quoteId)) {
			return res.status(400).json({ message: "Invalid quote id" });
		}
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			// Operator must pick exactly one container per quote line. The
			// promote helper used to silently drop excess containers or
			// leave lines unpriced when counts mismatched — the operator
			// asked us to enforce 1:1 so the promoted invoice always
			// matches the quoted scope.
			const { rows: lineRows } = await client.query(
				"SELECT COUNT(*)::int AS n FROM quote_line_items WHERE quote_id = $1",
				[quoteId],
			);
			const lineCount = lineRows[0].n;
			const containerCount = req.body.containers.length;
			if (containerCount !== lineCount) {
				await client.query("ROLLBACK");
				return res.status(400).json({
					code: "container_count_mismatch",
					message: `Quote has ${lineCount} line${lineCount === 1 ? "" : "s"} but ${containerCount} container${containerCount === 1 ? "" : "s"} were submitted.`,
					details: { lineCount, containerCount },
				});
			}
			const result = await promoteQuoteToInvoice(client, quoteId, req.body);
			await client.query("COMMIT");
			res.status(200).json({ status: "success", ...result });
		} catch (err) {
			await client.query("ROLLBACK");
			if (err.status) {
				return res.status(err.status).json({ message: err.message });
			}
			console.error("quote.promote error:", err);
			res.status(500).json({ message: err.message || "Internal server error" });
		} finally {
			client.release();
		}
	},
);

export default router;
