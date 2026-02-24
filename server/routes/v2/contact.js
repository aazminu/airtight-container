import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from contacts ORDER BY contact_name"
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { contacts: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO contacts (contact_name, contact_email, contact_phone, contact_address) VALUES ($1, $2, $3, $4) RETURNING *",
			[
				req.body.customer.contact_name,
				req.body.customer.contact_email,
				req.body.customer.contact_phone,
				req.body.customer.contact_address,
			]
		);
		res.status(200).json({ status: "success", contact: results.rows[0] });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"UPDATE contacts SET contact_name = $1, contact_email = $2, contact_phone = $3, contact_address = $4 WHERE contact_id=$5",
			[
				req.body.editedContact.contact_name,
				req.body.editedContact.contact_email,
				req.body.editedContact.contact_phone,
				req.body.editedContact.contact_address,
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
		await db.query("DELETE FROM contacts where id=$1", [req.params.id]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
