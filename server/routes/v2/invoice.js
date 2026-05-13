import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { renderAndStoreInvoicePdf } from "../../lib/pdf.js";

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
				// Snapshot totals (populated by PR 1.3 backfill; consumed by Phase 3)
				subtotal: row.subtotal,
				tax_rate: row.tax_rate,
				tax_amount: row.tax_amount,
				cc_fee_rate: row.cc_fee_rate,
				cc_fee_amount: row.cc_fee_amount,
				total: row.total,
				customer: {
					// Legacy keys preserved for backwards compat
					contact_id: row.client_id,
					contact_name: row.client_name,
					contact_email: row.contact_email,
					contact_phone: row.contact_phone,
					contact_address: composeAddress(row),
					// New-shape fields
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
		});
		return acc;
	}, []);
};

// Explicit column list — both `clients.state` and `inventory.state` exist,
// so they get separate aliases. Same for inventory.id (renamed to
// container_id) so it doesn't collide with potential future invoice columns.
const INVOICE_SELECT_COLS = `
	i.invoice_id, i.invoice_number, i.invoice_taxed, i.invoice_credit, i.invoice_date,
	i.subtotal, i.tax_rate, i.tax_amount, i.cc_fee_rate, i.cc_fee_amount, i.total,
	i.pdf_s3_key, i.sent_at, i.client_id,
	cl.client_name, cl.business_name, cl.contact_email, cl.contact_phone,
	cl.street, cl.city, cl.state AS client_state, cl.zip,
	ct.id AS container_id, ct.unit_number, ct.size, ct.damage, ct.state AS inventory_state,
	sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price, sc.modification_price, sc.invoice_notes
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
			 ORDER BY i.invoice_id DESC`
		);
		const grouped = groupInvoices(results.rows);
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

router.get("/latest", async (req, res) => {
	try {
		const results = await db.query(
			"SELECT invoice_number FROM invoices ORDER BY invoice_number DESC LIMIT 1"
		);
		res.status(200).json({
			status: "success",
			latest: results.rows[0]?.invoice_number ?? null,
		});
	} catch (err) {
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
			 ORDER BY i.invoice_id, ci.container_id`,
			[req.params.id]
		);
		const grouped = groupInvoices(results.rows);
		res.status(200).json({
			status: "success",
			results: grouped.length,
			data: { invoices: grouped },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/", checkEmployee, async (req, res) => {
	try {
		// Accept either client_id (new) or contact_id (legacy) in the body
		const clientId = req.body.client_id ?? req.body.contact_id;
		const results = await db.query(
			"INSERT INTO invoices (invoice_number, client_id, invoice_taxed, invoice_credit) VALUES ($1, $2, $3, $4) RETURNING invoice_id",
			[
				req.body.invoice_number,
				clientId,
				req.body.invoice_taxed,
				req.body.invoice_credit,
			]
		);
		const invoiceID = results.rows[0].invoice_id;
		for (const container of req.body.containers) {
			await db.query(
				"INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)",
				[invoiceID, container.id]
			);
		}
		res.status(200).json({ status: "success", id: invoiceID });
	} catch (err) {
		console.error("invoice.post error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/tax/:id", checkEmployee, async (req, res) => {
	try {
		await db.query(
			"UPDATE invoices SET invoice_taxed = $1 WHERE invoice_id = $2",
			[req.body.invoice_taxed, req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/credit/:id", checkEmployee, async (req, res) => {
	try {
		await db.query(
			"UPDATE invoices SET invoice_credit = $1 WHERE invoice_id = $2",
			[req.body.invoice_credit, req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query("DELETE from invoices where invoice_id = $1", [
			req.params.id,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 3.2: render an invoice's PDF via headless Chromium, store to S3
// at invoices/<id>.pdf, and update the invoice row's pdf_s3_key.
// Idempotent — re-running overwrites the S3 object with the latest
// template render.
router.post("/:id/pdf", checkAdmin, async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		if (!Number.isFinite(id)) {
			return res.status(400).json({ message: "Invalid invoice id" });
		}
		const result = await renderAndStoreInvoicePdf(id);
		await db.query(
			"UPDATE invoices SET pdf_s3_key = $1 WHERE invoice_id = $2",
			[result.s3Key, id]
		);
		res.status(200).json({ status: "success", ...result });
	} catch (err) {
		console.error("invoice.pdf error:", err);
		res.status(500).json({ message: err.message || "Internal server error" });
	}
});

router.delete("/container/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"DELETE FROM invoice_containers WHERE container_id = $1",
			[req.params.id]
		);
		await db.query("DELETE FROM sold WHERE inventory_id = $1", [
			req.params.id,
		]);
		await db.query(
			"UPDATE inventory SET state = 'available' WHERE id = $1",
			[req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
