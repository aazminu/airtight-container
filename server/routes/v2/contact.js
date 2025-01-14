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
router.get("/", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"select * from contacts ORDER BY contact_name"
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: {
				contacts: results.rows,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//POSTS
router.post("/", checkAuth, async (req, res) => {
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
		res.status(200).json({
			status: "success",
			contact: results.rows[0],
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//PUTS
router.put("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE contacts SET contact_name = $1, contact_email = $2, contact_phone = $3, contact_address = $4 WHERE contact_id=$5",
			[
				req.body.editedContact.contact_name,
				req.body.editedContact.contact_email,
				req.body.editedContact.contact_phone,
				req.body.editedContact.contact_address,
				req.params.id,
			]
		);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//DELETES
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query("DELETE FROM contacts where id=$1", [
			req.params.id,
		]);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

module.exports = router;
