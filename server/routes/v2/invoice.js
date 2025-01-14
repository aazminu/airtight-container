const { Router } = require("express");
const db = require("../../db");
const router = Router();

const checkAuth = (req, res, next) => {
	if (req.session.permissions !== "none") return next();
	else {
		console.log("Unauth'd action");
		res.status(401).json({
			message: "Unauthorized action",
			user: {
				email: req.session.email,
				permissions: req.session.permissions,
			},
		});
	}
};

const checkAdmin = (req, res, next) => {
	if (req.session.permissions === "admin") return next();
	else {
		console.log("Unauth'd admin action", req.session.permissions);
		res.status(401).json({
			message: "Unauthorized action, admin access only.",
			user: {
				email: req.session.email,
				permissions: req.session.permissions,
			},
		});
	}
};

//GETS

// Logic for de-flattening sql result for invoices

const groupInvoices = (data) => {
	const groupedData = data.reduce((acc, row) => {
		let invoice = acc.find((inv) => inv.invoice_id === row.invoice_id);
		if (!invoice) {
			// Add a new invoice entry
			invoice = {
				invoice_id: row.invoice_id,
				invoice_number: row.invoice_number,
				invoice_taxed: row.invoice_taxed,
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
		// Add the container to the invoice
		invoice.containers.push({
			inventory_id: row.id,
			unit_number: row.unit_number,
			state: row.state,
			size: row.size,
			damage: row.damage,
			destination: row.destination,
			trucking_rate: row.trucking_rate,
			sale_price: row.sale_price,
			outbound_date: row.outbound_date,
		});
		return acc;
	}, []);
	return groupedData;
};

router.get("/", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT i.*, c.*, ct.id, ct.unit_number, ct.size, ct.damage, ct.state, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price FROM invoices i JOIN contacts c ON i.contact_id = c.contact_id JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id JOIN inventory ct ON ci.container_id = ct.id LEFT JOIN sold sc ON ct.id = sc.inventory_id ORDER BY i.invoice_id DESC"
		);
		let groupedInvoices = groupInvoices(results.rows);
		res.status(200).json({
			status: "success",
			results: groupedInvoices.length,
			data: {
				invoices: groupedInvoices,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
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
		console.log(err);
		res.status(400);
	}
});

router.get("/:id", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT i.*, c.*, ct.unit_number, ct.size, ct.damage, ct.state, sc.outbound_date, sc.destination, sc.trucking_rate, sc.sale_price FROM invoices i JOIN contacts c ON i.contact_id = c.contact_id JOIN invoice_containers ci ON i.invoice_id = ci.invoice_id JOIN inventory ct ON ci.container_id = ct.id LEFT JOIN sold sc ON ct.id = sc.inventory_id WHERE i.invoice_id = $1 ORDER BY i.invoice_id, ci.container_id",
			[req.params.id]
		);
		let groupedInvoices = groupInvoices(results.rows);
		res.status(200).json({
			status: "success",
			results: groupedInvoices.length,
			data: {
				invoices: groupedInvoices,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//POSTS

// Adds an invoice and a set of containers into that invoice
// Requires invoice number, id of the contact to whom the invoice goes, and
// invoice_taxed (bool)
router.post("/", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO invoices (invoice_number, contact_id, invoice_taxed) VALUES ($1, $2, $3) RETURNING invoice_id",
			[
				req.body.invoice_number,
				req.body.contact_id,
				req.body.invoice_taxed,
			]
		);

		const invoiceID = results.rows[0].invoice_id;
		console.log(results.rows);
		for (const container of req.body.containers) {
			await db.query(
				"INSERT INTO invoice_containers (invoice_id, container_id) VALUES ($1, $2)",
				[invoiceID, container.id]
			);
		}

		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//PUTS

// ONLY ALLOWING TAXATION TO BE MUTABLE-- INVOICE NUMBERS WILL BE PROCEDURALLY
// GENERATED AND CONTACT ID WILL NEVER CHANGE, CONTACT PUTS IN "contacts.js"
router.put("/:id", checkAuth, async (req, res) => {
	try {
		console.log("called: " + req.body.invoice_taxed);
		const results = await db.query(
			"UPDATE invoices SET invoice_taxed = $1 WHERE invoice_id = $2",
			[req.body.invoice_taxed, req.params.id]
		);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

// DELETES

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"DELETE from invoices where invoice_id = $1",
			[req.params.id]
		);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

// REMOVE CONTAINER FROM AN INVOICE
// and send back to available containers on "inventory" page.
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
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

module.exports = router;
