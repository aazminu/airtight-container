import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { createClientSchema } from "../../validation/client.js";
import { normalizePhone } from "../../lib/phone.js";

const router = express.Router();

// Compose split address columns back into a single legacy-shaped string for
// any client-side code still using `contact_address` until PR 1.5's Clients
// page is wired up.
const composeAddress = (row) => {
	const parts = [];
	if (row.street) parts.push(row.street);
	if (row.city || row.state || row.zip) {
		const cityState = [row.city, row.state].filter(Boolean).join(", ");
		const tail = [cityState, row.zip].filter(Boolean).join(" ");
		if (tail) parts.push(tail);
	}
	return parts.join(", ") || null;
};

// Project a clients row into the legacy contacts response shape so the
// 4 existing consumers (CustomerRow, DeliverySheet, SelectCustomer x2)
// don't need shape changes — only the URL change from /contact → /clients.
const projectLegacyShape = (row) => ({
	contact_id: row.id,
	contact_name: row.client_name,
	contact_email: row.contact_email,
	contact_phone: row.contact_phone,
	contact_address: composeAddress(row),
	// New-shape fields also present for PR 1.5+ consumers
	id: row.id,
	client_name: row.client_name,
	business_name: row.business_name,
	street: row.street,
	city: row.city,
	state: row.state,
	zip: row.zip,
	default_in_fee: row.default_in_fee,
	default_out_fee: row.default_out_fee,
	default_daily_rate: row.default_daily_rate,
});

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from clients ORDER BY client_name"
		);
		const rows = results.rows.map(projectLegacyShape);
		res.status(200).json({
			status: "success",
			results: rows.length,
			// `contacts` key kept for legacy callers; mirrors `clients` for new code.
			data: { contacts: rows, clients: rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkEmployee,
	validateBody(createClientSchema),
	async (req, res) => {
		try {
			const c = req.body.customer;
			// Legacy form posts `contact_address` as a single string; store
			// the whole thing in `street` and leave city/state/zip null until
			// PR 1.5's ClientForm provides split inputs.
			const street = c.street ?? c.contact_address ?? null;
			const results = await db.query(
				`INSERT INTO clients (
					client_name, business_name, contact_email, contact_phone,
					street, city, state, zip
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
				[
					c.client_name ?? c.contact_name,
					c.business_name ?? null,
					c.contact_email ?? null,
					normalizePhone(c.contact_phone),
					street,
					c.city ?? null,
					c.state ?? null,
					c.zip ?? null,
				]
			);
			res.status(200).json({
				status: "success",
				// `contact` key kept for legacy callers (POST body in SelectCustomer)
				contact: projectLegacyShape(results.rows[0]),
				client: projectLegacyShape(results.rows[0]),
			});
		} catch (err) {
			res.status(500).json({ message: "Internal server error" });
		}
	}
);

router.put("/:id", checkAdmin, async (req, res) => {
	try {
		// Legacy CustomerRow sends { editedContact: { contact_name, contact_email, ... } }
		// Accept either shape so PR 1.5's ClientForm can use a cleaner payload.
		const c = req.body.editedClient ?? req.body.editedContact ?? {};
		const street = c.street ?? c.contact_address ?? null;
		await db.query(
			`UPDATE clients SET
				client_name = $1,
				business_name = COALESCE($2, business_name),
				contact_email = $3,
				contact_phone = $4,
				street = $5,
				city = COALESCE($6, city),
				state = COALESCE($7, state),
				zip = COALESCE($8, zip)
			 WHERE id = $9`,
			[
				c.client_name ?? c.contact_name,
				c.business_name ?? null,
				c.contact_email ?? null,
				normalizePhone(c.contact_phone),
				street,
				c.city ?? null,
				c.state ?? null,
				c.zip ?? null,
				req.params.id,
			]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query("DELETE FROM clients where id=$1", [req.params.id]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
