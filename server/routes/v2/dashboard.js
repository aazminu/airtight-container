const { Router } = require("express");
const db = require("../../db");
const router = Router();

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
router.get("/", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT email, permissions, id FROM users ORDER BY permissions"
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			accounts: results.rows,
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//POSTS

// NO POSTS

//PUTS

router.put("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE users SET permissions = $1 where id = $2",
			[req.body.new_permissions, req.params.id]
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
		const results = await db.query("DELETE from users where id = $1", [
			req.params.id,
		]);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: {
				inventory: results.rows,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

module.exports = router;
