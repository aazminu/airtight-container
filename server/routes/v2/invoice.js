import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

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
				customer: {
					contact_id: row.contact_id,
					contact_name: row.contact_name,
					contact_email: row.contact_email,
					contact_phone: row.contact_phone,
					contact_address: row.contact_address,
				},
				containers: [],
			};
			acc.push(invoice);
		}
		invoice.containers.push({
			inventory_id: row.id,
			unit_number: row.unit_number,
			state: row.state,
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

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT i.*, c.*, ct.id, ct.unit_number, ct.size, ct.damage, ct.state, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price, sc.modification_price, sc.invoice_notes FROM invoices i JOIN contacts c ON i.contact_id = c.contact_id JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id JOIN inventory ct ON ci.container_id = ct.id LEFT JOIN sold sc ON ct.id = sc.inventory_id ORDER BY i.invoice_id DESC"
		);
		const groupedInvoices = groupInvoices(results.rows);
		res.status(200).json({
			status: "success",
			results: groupedInvoices.length,
			data: { invoices: groupedInvoices },
		});
	} catch (err) {
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
			latest: results.rows[0].invoice_number,
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT i.*, c.*, ct.unit_number, ct.size, ct.damage, ct.state, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price, sc.modification_price, sc.invoice_notes FROM invoices i JOIN contacts c ON i.contact_id = c.contact_id JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id JOIN inventory ct ON ci.container_id = ct.id LEFT JOIN sold sc ON ct.id = sc.inventory_id WHERE i.invoice_id = $1 ORDER BY i.invoice_id, ci.container_id",
			[req.params.id]
		);
		const groupedInvoices = groupInvoices(results.rows);
		res.status(200).json({
			status: "success",
			results: groupedInvoices.length,
			data: { invoices: groupedInvoices },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO invoices (invoice_number, contact_id, invoice_taxed, invoice_credit) VALUES ($1, $2, $3, $4) RETURNING invoice_id",
			[
				req.body.invoice_number,
				req.body.contact_id,
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
