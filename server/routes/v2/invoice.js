import express from "express";
import db from "../../db/index.js";
import pool from "../../db/pool.js";
import { Resend } from "resend";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { renderAndStoreInvoicePdf, getInvoicePdfBytes } from "../../lib/pdf.js";

const router = express.Router();

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
				subtotal: row.subtotal,
				tax_rate: row.tax_rate,
				tax_amount: row.tax_amount,
				cc_fee_rate: row.cc_fee_rate,
				cc_fee_amount: row.cc_fee_amount,
				total: row.total,
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
			modifications: [],
		});
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
		`SELECT id, sold_id, description, price, position
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
	i.pdf_s3_key, i.sent_at, i.client_id,
	cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
	cl.street, cl.city, cl.state AS client_state, cl.zip,
	ct.id AS container_id, ct.unit_number, ct.size, ct.damage, ct.state AS inventory_state,
	sc.id AS sold_id, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price,
	sc.modification_price, sc.invoice_notes
`;

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${INVOICE_SELECT_COLS}
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id
			 JOIN inventory ct ON ci.container_id = ct.id
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
		console.error("invoice.get error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT ${INVOICE_SELECT_COLS}
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id
			 JOIN inventory ct ON ci.container_id = ct.id
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
		console.error("invoice.getOne error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 3.5: server-side YYYYMM<seq> generation. Two clients clicking
// "Create" within the same render tick would otherwise both pick the
// same number from /latest and collide on the UNIQUE constraint. The
// advisory lock serializes the read-max + insert so the sequence is
// monotonic per month. Key is a constant 64-bit int; pg_advisory_xact_lock
// auto-releases at COMMIT/ROLLBACK.
const INVOICE_SEQ_LOCK_KEY = 0x4149_5253_4551_4e23n; // 'AIRSEQ#'

const monthPrefix = (date = new Date()) => {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	return parseInt(`${y}${m}`, 10);
};

router.post("/", checkEmployee, async (req, res) => {
	const clientId = req.body.client_id ?? req.body.contact_id;
	if (!clientId) {
		return res.status(400).json({ message: "client_id is required" });
	}
	const containers = Array.isArray(req.body.containers)
		? req.body.containers
		: [];
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT pg_advisory_xact_lock($1)", [
			INVOICE_SEQ_LOCK_KEY.toString(),
		]);
		const prefix = monthPrefix();
		const min = prefix * 1000 + 1;
		const max = prefix * 1000 + 999;
		const { rows: maxRows } = await client.query(
			`SELECT COALESCE(MAX(invoice_number), $1::int - 1) + 1 AS next
			 FROM invoices
			 WHERE invoice_number BETWEEN $1 AND $2`,
			[min, max],
		);
		const invoiceNumber = maxRows[0].next;
		if (invoiceNumber > max) {
			throw new Error(
				`Out of invoice numbers for ${prefix} (sequence exhausted at 999)`,
			);
		}
		const { rows: invRows } = await client.query(
			`INSERT INTO invoices (invoice_number, client_id, invoice_taxed, invoice_credit)
			 VALUES ($1, $2, $3, $4)
			 RETURNING invoice_id`,
			[
				invoiceNumber,
				clientId,
				req.body.invoice_taxed ?? false,
				req.body.invoice_credit ?? false,
			],
		);
		const invoiceID = invRows[0].invoice_id;
		for (const container of containers) {
			const cid = container.id ?? container.inventory_id;
			if (!cid) continue;
			await client.query(
				"INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)",
				[invoiceID, cid],
			);
		}
		await client.query("COMMIT");
		res.status(200).json({
			status: "success",
			id: invoiceID,
			invoice_number: invoiceNumber,
		});
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("invoice.post error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	} finally {
		client.release();
	}
});

// Recomputes invoice totals from the current container + modification rows
// and snapshots them onto the invoice. Called inside the PUT transaction.
const recomputeTotals = async (client, invoiceId) => {
	const { rows: ctRows } = await client.query(
		`SELECT sc.id AS sold_id, sc.sale_price, sc.trucking_rate, sc.modification_price
		 FROM invoice_containers ci
		 JOIN inventory inv ON ci.container_id = inv.id
		 LEFT JOIN sold sc ON inv.id = sc.inventory_id
		 WHERE ci.invoice_id = $1`,
		[invoiceId],
	);
	const soldIds = ctRows.map((r) => r.sold_id).filter((id) => id != null);
	let modsBySold = new Map();
	if (soldIds.length > 0) {
		const { rows: modRows } = await client.query(
			`SELECT sold_id, price FROM sold_modifications WHERE sold_id = ANY($1::int[])`,
			[soldIds],
		);
		for (const m of modRows) {
			if (!modsBySold.has(m.sold_id)) modsBySold.set(m.sold_id, 0);
			modsBySold.set(m.sold_id, modsBySold.get(m.sold_id) + Number(m.price));
		}
	}
	let subtotal = 0;
	for (const r of ctRows) {
		subtotal += Number(r.sale_price ?? 0);
		subtotal += Number(r.trucking_rate ?? 0);
		// Per-mod line items take precedence; fall back to legacy
		// scalar only if there are no per-mod rows for this sold.
		const perMod = modsBySold.get(r.sold_id);
		if (perMod !== undefined && perMod > 0) {
			subtotal += perMod;
		} else {
			subtotal += Number(r.modification_price ?? 0);
		}
	}
	const { rows: invRows } = await client.query(
		"SELECT invoice_taxed, invoice_credit, tax_rate, cc_fee_rate FROM invoices WHERE invoice_id = $1",
		[invoiceId],
	);
	const inv = invRows[0];
	const taxRate = Number(inv.tax_rate ?? 0);
	const ccRate = Number(inv.cc_fee_rate ?? 0);
	const taxAmount = inv.invoice_taxed ? subtotal * taxRate : 0;
	const ccAmount = inv.invoice_credit ? (subtotal + taxAmount) * ccRate : 0;
	const total = subtotal + taxAmount + ccAmount;
	await client.query(
		`UPDATE invoices
		 SET subtotal = $1, tax_amount = $2, cc_fee_amount = $3, total = $4
		 WHERE invoice_id = $5`,
		[
			subtotal.toFixed(2),
			taxAmount.toFixed(2),
			ccAmount.toFixed(2),
			total.toFixed(2),
			invoiceId,
		],
	);
};

// Full invoice edit. Body shape mirrors the GET response — the server
// reconciles against current state to figure out which containers and
// modifications to add, update, or remove. All mutations run in a
// single transaction; totals are recomputed at the end.
router.put("/:id", checkAdmin, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	const body = req.body;
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		await client.query(
			`UPDATE invoices
			 SET client_id = COALESCE($1, client_id),
			     invoice_taxed = COALESCE($2, invoice_taxed),
			     invoice_credit = COALESCE($3, invoice_credit),
			     invoice_date = COALESCE($4, invoice_date),
			     tax_rate = $5,
			     cc_fee_rate = $6
			 WHERE invoice_id = $7`,
			[
				body.client_id ?? null,
				body.invoice_taxed ?? null,
				body.invoice_credit ?? null,
				body.invoice_date ?? null,
				body.tax_rate ?? null,
				body.cc_fee_rate ?? null,
				invoiceId,
			],
		);

		const { rows: existingCt } = await client.query(
			`SELECT ci.container_id, sc.id AS sold_id
			 FROM invoice_containers ci
			 LEFT JOIN sold sc ON ci.container_id = sc.inventory_id
			 WHERE ci.invoice_id = $1`,
			[invoiceId],
		);
		const existingIds = new Set(existingCt.map((r) => r.container_id));
		const incoming = Array.isArray(body.containers) ? body.containers : [];
		const incomingIds = new Set(incoming.map((c) => c.inventory_id));

		// Remove containers that fell off the invoice
		for (const row of existingCt) {
			if (!incomingIds.has(row.container_id)) {
				await client.query(
					"DELETE FROM invoice_containers WHERE invoice_id = $1 AND container_id = $2",
					[invoiceId, row.container_id],
				);
				await client.query("DELETE FROM sold WHERE inventory_id = $1", [
					row.container_id,
				]);
				await client.query(
					"UPDATE inventory SET state = 'available' WHERE id = $1",
					[row.container_id],
				);
			}
		}

		// Add new containers + upsert sold rows
		for (const ct of incoming) {
			if (!existingIds.has(ct.inventory_id)) {
				await client.query(
					"INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)",
					[invoiceId, ct.inventory_id],
				);
				await client.query(
					"UPDATE inventory SET state = 'sold' WHERE id = $1",
					[ct.inventory_id],
				);
			}
			// Upsert sold row (one sold row per inventory_id by unique constraint)
			await client.query(
				`INSERT INTO sold (inventory_id, sale_price, trucking_rate,
				                   modification_price, destination, invoice_notes,
				                   outbound_date)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 ON CONFLICT (inventory_id) DO UPDATE SET
				   sale_price = EXCLUDED.sale_price,
				   trucking_rate = EXCLUDED.trucking_rate,
				   modification_price = EXCLUDED.modification_price,
				   destination = EXCLUDED.destination,
				   invoice_notes = EXCLUDED.invoice_notes,
				   outbound_date = EXCLUDED.outbound_date`,
				[
					ct.inventory_id,
					ct.sale_price ?? null,
					ct.trucking_rate ?? null,
					ct.modification_price ?? null,
					ct.destination ?? null,
					ct.invoice_notes ?? null,
					ct.outbound_date ?? null,
				],
			);

			// Reconcile per-modification line items: simplest correct
			// thing is delete-all-then-reinsert for this sold row.
			// Mods are display-only and not referenced elsewhere.
			const { rows: soldRow } = await client.query(
				"SELECT id FROM sold WHERE inventory_id = $1",
				[ct.inventory_id],
			);
			const soldId = soldRow[0]?.id;
			if (soldId != null) {
				await client.query(
					"DELETE FROM sold_modifications WHERE sold_id = $1",
					[soldId],
				);
				const mods = Array.isArray(ct.modifications) ? ct.modifications : [];
				for (let i = 0; i < mods.length; i++) {
					const m = mods[i];
					if (!m.description || m.price == null) continue;
					await client.query(
						"INSERT INTO sold_modifications (sold_id, description, price, position) VALUES ($1, $2, $3, $4)",
						[soldId, m.description, m.price, m.position ?? i],
					);
				}
			}
		}

		await recomputeTotals(client, invoiceId);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("invoice.put error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
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
		const { rows } = await client.query(
			"SELECT container_id FROM invoice_containers WHERE invoice_id = $1",
			[invoiceId],
		);
		for (const r of rows) {
			await client.query("DELETE FROM sold WHERE inventory_id = $1", [
				r.container_id,
			]);
			await client.query(
				"UPDATE inventory SET state = 'available' WHERE id = $1",
				[r.container_id],
			);
		}
		await client.query("DELETE FROM invoices WHERE invoice_id = $1", [
			invoiceId,
		]);
		await client.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await client.query("ROLLBACK");
		console.error("invoice.delete error:", err);
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
		const result = await renderAndStoreInvoicePdf(id);
		await db.query(
			"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
			[result.s3Key, id],
		);
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		console.error("invoice.pdf error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

// PR 3.4: send the current PDF to the customer (regenerating it first
// if absent) and mark sent_at. BCCs the personal logging addresses
// the owner has used historically.
const SEND_BCC = ["vagabond7257@gmail.com", "hlynch02@tufts.edu"];

router.post("/:id/email", checkAdmin, async (req, res) => {
	const invoiceId = parseInt(req.params.id, 10);
	if (!Number.isFinite(invoiceId)) {
		return res.status(400).json({ message: "Invalid invoice id" });
	}
	try {
		const { rows } = await db.query(
			`SELECT i.invoice_number, i.pdf_s3_key, cl.contact_email, cl.client_name
			 FROM invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 WHERE i.invoice_id = $1`,
			[invoiceId],
		);
		const inv = rows[0];
		if (!inv) return res.status(404).json({ message: "Not found" });
		const to = req.body?.to ?? inv.contact_email;
		if (!to)
			return res.status(400).json({ message: "No recipient email on file" });

		let pdfKey = inv.pdf_s3_key;
		if (!pdfKey) {
			const result = await renderAndStoreInvoicePdf(invoiceId);
			pdfKey = result.s3Key;
			await db.query(
				"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
				[pdfKey, invoiceId],
			);
		}

		const pdfBytes = await getInvoicePdfBytes(pdfKey);
		const resend = new Resend(process.env.RESEND);
		const subject = `Invoice #${inv.invoice_number} from Airtight Storage Systems`;
		const html = `<p>Hi ${inv.client_name ?? ""},</p>
			<p>Your invoice <strong>#${inv.invoice_number}</strong> is attached.</p>
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
			console.error("invoice.email resend error:", error);
			return res.status(502).json({ message: error.message ?? "Resend failure" });
		}
		await db.query(
			"UPDATE invoices SET sent_at = NOW() WHERE invoice_id = $1",
			[invoiceId],
		);
		res.status(200).json({ status: "success", message_id: data?.id });
	} catch (err) {
		console.error("invoice.email error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

export default router;
