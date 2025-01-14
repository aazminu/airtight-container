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
			"select * from releases ORDER BY company"
		);
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

//POSTS
router.post("/", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO releases (company, number) VALUES ($1, $2)",
			[req.body.company, req.body.number]
		);
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

//PUTS
router.put("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE releases SET company = $1, number = $2 where id=$3",
			[req.body.company, req.body.number, req.params.id]
		);
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

//DELETES
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query("DELETE FROM releases where id=$1", [
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
