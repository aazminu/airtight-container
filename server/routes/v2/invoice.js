import express from "express";
import rateLimit from "express-rate-limit";
import db from "../../db/index.js";
import pool from "../../db/pool.js";
import { Resend } from "resend";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { renderAndStoreInvoicePdf, getInvoicePdfBytes } from "../../lib/pdf.js";
import {
	createInvoice,
	updateInvoiceFull,
	deleteInvoiceCascade,
} from "../../lib/invoice-ops.js";

const router = express.Router();

// Abuse cap on the paid email channel (Resend bills per send); per-IP,
// generous for a single operator. Tune if it bites legitimate use.
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const composeAddress = (row) => {
	const parts = [];
	if (row.street) parts.push(row.street);
	if (row.city || row.client_state || row.zip) {
		const cityState = [row.city, row.client_state].filter(Boolean).join(", ");
		const tail = [cityState, row.zip].filter(Boolean).join(" ");
		if (tail) parts.push(tail);
	}
	return parts.join(", ") || null;
};

// Build invoice tree from the joined select. Each row is one
// (invoice × container) pair; we deduplicate by invoice_id and
// accumulate containers. Modifications are stitched in by a separate
// query after grouping (one IN-list query, not N+1).
const groupInvoices = (data) => {
	return data.reduce((acc, row) => {
		let invoice = acc.find((inv) => inv.invoice_id === row.invoice_id);
		if (!invoice) {
			invoice = {
				invoice_id: row.invoice_id,
				invoice_number: row.invoice_number,
				invoice_taxed: row.invoice_taxed,
				invoice_credit: row.invoice_credit,
				invoice_date: row.invoice_date,
				sent_at: row.sent_at,
				pdf_s3_key: row.pdf_s3_key,
				deleted_at: row.deleted_at,
				status: row.status,
				status_changed_at: row.status_changed_at,
				status_changed_by_user_id: row.status_changed_by_user_id,
				subtotal: row.subtotal,
				tax_rate: row.tax_rate,
				tax_amount: row.tax_amount,
				cc_fee_rate: row.cc_fee_rate,
				cc_fee_amount: row.cc_fee_amount,
				total: row.total,
				ship_to_same_as_billing: row.ship_to_same_as_billing,
				ship_to_name: row.ship_to_name,
				ship_to_street: row.ship_to_street,
				ship_to_city: row.ship_to_city,
				ship_to_state: row.ship_to_state,
				ship_to_zip: row.ship_to_zip,
				customer: {
					contact_id: row.client_id,
					contact_name: row.client_name,
					contact_email: row.contact_email,
					contact_phone: row.contact_phone,
					contact_address: composeAddress(row),
					id: row.client_id,
					client_name: row.client_name,
					business_name: row.business_name,
					street: row.street,
					city: row.city,
					state: row.client_state,
					zip: row.zip,
				},
				containers: [],
			};
			acc.push(invoice);
		}
		// Tombstoned invoices have no invoice_containers — the LEFT JOIN
		// produces one row with container_id = null. Don't fabricate an
		// empty container slot.
		if (row.container_id != null) {
			invoice.containers.push({
				inventory_id: row.container_id,
				sold_id: row.sold_id,
				unit_number: row.unit_number,
				state: row.inventory_state,
				size: row.size,
				damage: row.damage,
				destination: row.destination,
				trucking_rate: row.trucking_rate,
				sale_price: row.sale_price,
				modification_price: row.modification_price,
				outbound_date: row.outbound_date,
				invoice_notes: row.invoice_notes,
				outbound_trucking_company_id: row.outbound_trucking_company_id,
				door_orientation: row.door_orientation,
				delivery_name: row.delivery_name,
				delivery_street: row.delivery_street,
				delivery_city: row.delivery_city,
				delivery_state: row.delivery_state,
				delivery_zip: row.delivery_zip,
				modifications: [],
			});
		}
		return acc;
	}, []);
};

// One query fetches every modification for every sold row across the
// invoices we just grouped. Mutates the input array in place to attach
// modifications to the right container.
const attachModifications = async (invoices) => {
	const soldIds = invoices
		.flatMap((inv) => inv.containers.map((c) => c.sold_id))
		.filter((id) => id != null);
	if (soldIds.length === 0) return;
	const { rows } = await db.query(
		`SELECT id, sold_id, description, price, quantity, position
		 FROM sold_modifications
		 WHERE sold_id = ANY($1::int[])
		 ORDER BY sold_id, position, id`,
		[soldIds],
	);
	const bySold = new Map();
	for (const row of rows) {
		if (!bySold.has(row.sold_id)) bySold.set(row.sold_id, []);
		bySold.get(row.sold_id).push(row);
	}
	for (const inv of invoices) {
		for (const ct of inv.containers) {
			ct.modifications = bySold.get(ct.sold_id) ?? [];
		}
	}
};

const INVOICE_SELECT_COLS = `
	i.invoice_id, i.invoice_number, i.invoice_taxed, i.invoice_credit, i.invoice_date,
	i.subtotal, i.tax_rate, i.tax_amount, i.cc_fee_rate, i.cc_fee_amount, i.total,
	i.pdf_s3_key, i.sent_at, i.deleted_at, i.client_id,
	i.status, i.status_changed_at, i.status_changed_by_user_id,
	i.ship_to_same_as_billing, i.ship_to_name, i.ship_to_street,
	i.ship_to_city, i.ship_to_state, i.ship_to_zip,
	cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
	cl.street, cl.city, cl.state AS client_state, cl.zip,
	ct.id AS container_id, ct.unit_number, ct.size, ct.damage, ct.state AS inventory_state,
	sc.id AS sold_id, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price,
	sc.modification_price, sc.invoice_notes,
	sc.outbound_trucking_company_id, sc.door_orientation,
	sc.delivery_name, sc.delivery_street, sc.delivery_city, sc.delivery_state, sc.delivery_zip
`;

// LEFT JOINs throughout: tombstoned invoices have their invoice_containers
// rows removed, so an INNER JOIN would hide them from the list entirely
// — which defeats the point of leaving the invoice_number occupied.
router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${INVOICE_SELECT_COLS}
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 LEFT JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id
			 LEFT JOIN inventory ct ON ci.container_id = ct.id
			 LEFT JOIN sold sc ON ct.id = sc.inventory_id
			 ORDER BY i.invoice_id DESC`,
		);
		const grouped = groupInvoices(results.rows);
		await attachModifications(grouped);
		res.status(200).json({
			status: "success",
			results: grouped.length,
			data: { invoices: grouped },
		});
	} catch (err) {
		req.log.error({ err }, "invoice list failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${INVOICE_SELECT_COLS}
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 LEFT JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id
			 LEFT JOIN inventory ct ON ci.container_id = ct.id
			 LEFT JOIN sold sc ON ct.id = sc.inventory_id
			 WHERE i.invoice_id = $1
			 ORDER BY ci.container_id`,
			[req.params.id],
		);
		const grouped = groupInvoices(results.rows);
		await attachModifications(grouped);
		res.status(200).json({
			status: "success",
			results: grouped.length,
			data: { invoices: grouped },
		});
	} catch (err) {
		req.log.error({ err }, "invoice get failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 3.5 + 3.10: number generation + container insertion live in
// lib/invoice-ops.ts so tests can exercise them outside the HTTP stack.
router.post("/", checkEmployee, async (req, res) => {
	const clientId = req.body.client_id ?? req.body.contact_id;
	if (!clientId) {
		return res.status(400).json({ message: "client_id is required" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await createInvoice(client, {
			client_id: clientId,
			invoice_taxed: req.body.invoice_taxed ?? false,
			invoice_credit: req.body.invoice_credit ?? false,
			containers: Array.isArray(req.body.containers) ? req.body.containers : [],
		});
		await client.query("COMMIT");
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		await client.query("ROLLBACK");
		req.log.error({ err }, "invoice create failed");
		res.status(500).json({ message: "Internal server error" });
	} finally {
		client.release();
	}
});

// Look up an invoice's deleted_at without pulling the full join. Returns
// `undefined` when the row doesn't exist so callers can disambiguate 404
// from "tombstoned".
const getDeletedAt = async (invoiceId) => {
	const { rows } = await db.query(
		"SELECT deleted_at FROM invoices WHERE invoice_id = $1",
		[invoiceId],
	);
	if (rows.length === 0) return undefined;
	return rows[0].deleted_at;
};

router.put("/:id", checkAdmin, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	const deletedAt = await getDeletedAt(invoiceId);
	if (deletedAt === undefined) {
		return res.status(404).json({ message: "Not found" });
	}
	if (deletedAt !== null) {
		return res.status(409).json({ message: "Invoice is deleted" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await updateInvoiceFull(client, invoiceId, req.body);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		req.log.error({ err }, "invoice update failed");
		res.status(500).json({ message: "Internal server error" });
	} finally {
		client.release();
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await deleteInvoiceCascade(client, invoiceId);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		req.log.error({ err }, "invoice delete failed");
		res.status(500).json({ message: "Internal server error" });
	} finally {
		client.release();
	}
});

// PR 3.2: render an invoice's PDF via headless Chromium, store to S3
// at invoices/<id>.pdf, and update pdf_s3_key. Idempotent.
router.post("/:id/pdf", checkAdmin, async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		if (!Number.isFinite(id)) {
			return res.status(400).json({ message: "Invalid invoice id" });
		}
		const deletedAt = await getDeletedAt(id);
		if (deletedAt === undefined) {
			return res.status(404).json({ message: "Not found" });
		}
		if (deletedAt !== null) {
			return res.status(409).json({ message: "Invoice is deleted" });
		}
		const result = await renderAndStoreInvoicePdf(id);
		await db.query(
			"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
			[result.s3Key, id],
		);
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		req.log.error({ err }, "invoice pdf render failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

// Download endpoint: always re-render fresh (so the bytes reflect the
// current invoice state, including modification line items), overwrite
// the cached S3 object, then stream the PDF back as an attachment. No
// email is sent. Mirrors the freshness guarantee of the email path.
router.get("/:id/pdf", checkAdmin, async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!Number.isFinite(id)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	try {
		const { rows } = await db.query(
			"SELECT invoice_number, deleted_at FROM invoices WHERE invoice_id = $1",
			[id],
		);
		const inv = rows[0];
		if (!inv) return res.status(404).json({ message: "Not found" });
		if (inv.deleted_at !== null) {
			return res.status(409).json({ message: "Invoice is deleted" });
		}
		const { s3Key } = await renderAndStoreInvoicePdf(id);
		await db.query(
			"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
			[s3Key, id],
		);
		const pdfBytes = await getInvoicePdfBytes(s3Key);
		res.status(200);
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader(
			"Content-Disposition",
			`attachment; filename="invoice-${inv.invoice_number}.pdf"`,
		);
		res.setHeader("Content-Length", pdfBytes.length);
		res.end(pdfBytes);
	} catch (err) {
		req.log.error({ err }, "invoice pdf download failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 10.1: lifecycle status. Any → any transition allowed (operator
// can "un-pay" a bounced check, revert an accidental cancel, etc.);
// the UI gates destructive transitions behind a confirmation modal.
// Status flip + audit columns happen in a single UPDATE so an unhandled
// crash can't leave the row half-updated.
const VALID_STATUSES = new Set([
	"draft",
	"awaiting",
	"paid",
	"delinquent",
	"cancelled",
]);

router.patch("/:id/status", checkAdmin, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	const status = req.body?.status;
	if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
		return res.status(400).json({
			message: `Status must be one of: ${[...VALID_STATUSES].join(", ")}`,
		});
	}
	try {
		const deletedAt = await getDeletedAt(invoiceId);
		if (deletedAt === undefined) {
			return res.status(404).json({ message: "Not found" });
		}
		if (deletedAt !== null) {
			return res.status(409).json({ message: "Invoice is deleted" });
		}
		const { rows } = await db.query(
			`UPDATE invoices
			   SET status = $1,
			       status_changed_at = NOW(),
			       status_changed_by_user_id = $2
			 WHERE invoice_id = $3
			 RETURNING invoice_id, status, status_changed_at, status_changed_by_user_id`,
			[status, req.user?.id ?? null, invoiceId],
		);
		res.status(200).json({ status: "success", data: { invoice: rows[0] } });
	} catch (err) {
		req.log.error({ err }, "invoice status update failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 3.4: send the current PDF to the customer (regenerating it first
// if absent) and mark sent_at. Internal BCC addresses (per
// SEND_BCC env var, comma-separated) get a silent copy. Empty/unset
// env var = no BCC, which is safer than baking addresses into source.
const SEND_BCC = (process.env.SEND_BCC ?? "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

// HTML-escape minimal entity set for interpolating user-controlled
// strings (client names, etc.) into outbound email HTML. Prevents
// stored XSS when a malicious client_name like "</p><script>..."
// reaches a customer's inbox.
const escapeHtml = (s) =>
	String(s ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

router.post("/:id/email", checkAdmin, emailLimiter, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	try {
		const { rows } = await db.query(
			`SELECT i.invoice_number, i.pdf_s3_key, i.deleted_at, i.client_id, cl.contact_email, cl.client_name
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 WHERE i.invoice_id = $1`,
			[invoiceId],
		);
		const inv = rows[0];
		if (!inv) return res.status(404).json({ message: "Not found" });
		if (inv.deleted_at !== null) {
			return res.status(409).json({ message: "Invoice is deleted" });
		}
		const to = req.body?.to ?? inv.contact_email;
		if (!to)
			return res.status(400).json({ message: "No recipient email on file" });
		// Validate a caller-supplied recipient: an unvalidated `to` both routes
		// the invoice PDF to an arbitrary string and (with update_client_email
		// below) can overwrite the client's email of record with garbage.
		if (
			req.body?.to !== undefined &&
			!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.to))
		) {
			return res.status(400).json({ message: "Invalid recipient email" });
		}

		// Always re-render fresh so post-edit changes (e.g. modification
		// line items) aren't stale: the cached S3 object is only updated on
		// explicit regenerate, so a send that trusts pdf_s3_key would attach
		// an out-of-date PDF. Re-rendering also overwrites the cache.
		const { s3Key: pdfKey } = await renderAndStoreInvoicePdf(invoiceId);
		await db.query(
			"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
			[pdfKey, invoiceId],
		);

		const pdfBytes = await getInvoicePdfBytes(pdfKey);
		const resend = new Resend(process.env.RESEND);
		const subject = `Invoice #${inv.invoice_number} from Airtight Storage Systems`;
		const html = `<p>Hi ${escapeHtml(inv.client_name)},</p>
			<p>Your invoice <strong>#${escapeHtml(inv.invoice_number)}</strong> is attached.</p>
			<p>Thank you,<br/>Airtight Storage Systems</p>`;
		const { data, error } = await resend.emails.send({
			from: "Michelle <michelle@airtightstorage.com>",
			to: [to],
			bcc: SEND_BCC,
			subject,
			html,
			attachments: [
				{
					filename: `invoice-${inv.invoice_number}.pdf`,
					content: pdfBytes.toString("base64"),
				},
			],
		});
		if (error) {
			req.log.error({ err: error }, "invoice email resend failed");
			return res.status(502).json({ message: "Email could not be sent" });
		}
		// Stamp sent_at and (if the invoice is still 'draft') promote
		// it to 'awaiting'. Don't downgrade paid/delinquent/cancelled —
		// re-sending a paid invoice as a receipt shouldn't re-open the
		// AR. The audit columns mirror the manual PATCH path.
		await db.query(
			`UPDATE invoices
			    SET sent_at = NOW(),
			        status = CASE WHEN status = 'draft' THEN 'awaiting' ELSE status END,
			        status_changed_at = CASE WHEN status = 'draft' THEN NOW() ELSE status_changed_at END,
			        status_changed_by_user_id = CASE WHEN status = 'draft' THEN $2 ELSE status_changed_by_user_id END
			  WHERE invoice_id = $1`,
			[invoiceId, req.user?.id ?? null],
		);
		// Back-fill the client's email from the recipient. Silent when none
		// is on file; only overwrite a different existing email when the
		// caller confirmed (update_client_email), so a one-off send doesn't
		// clobber the address of record.
		const onFile = (inv.contact_email ?? "").trim();
		const typed = String(to).trim();
		if (typed && typed !== onFile && (!onFile || req.body?.update_client_email === true)) {
			await db.query("UPDATE clients SET contact_email = $1 WHERE id = $2", [
				typed,
				inv.client_id,
			]);
		}
		res.status(200).json({ status: "success", message_id: data?.id });
	} catch (err) {
		req.log.error({ err }, "invoice email failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
