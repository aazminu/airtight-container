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
			"select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id ORDER BY sold.id"
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

router.get("/:unitNumber", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id where inventory.unit_number=$1",
			[req.params.unitNumber]
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
		await db.query(
			"INSERT INTO sold (inventory_id, sold_date, destination, sale_price, release_number, trucking_rate, modification_price, invoice_notes) VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7)",
			[
				req.body.id,
				req.body.destination,
				req.body.sale_price,
				req.body.release_number,
				req.body.trucking_rate,
				req.body.modification_price,
				req.body.invoice_notes,
			]
		);

		await db.query("UPDATE inventory SET state = 'sold' where id = $1", [
			req.body.id,
		]);

		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//PUTS
router.put("/invoice/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE sold SET outbound_trucker = $1, destination = $2, trucking_rate = $3, modification_price = $4, sale_price = $5 WHERE inventory_id = $6 RETURNING *",
			[
				req.body.outbound_trucker,
				req.body.destination,
				req.body.trucking_rate,
				req.body.modification_price,
				req.body.sale_price,
				req.params.id,
			]
		);
		console.log(results.rows);
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

router.put("/deliverysheet/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"UPDATE sold SET outbound_trucker = $1, outbound_date = $2 WHERE inventory_id = $3",
			[req.body.outbound_trucker, req.body.outbound_date, req.params.id]
		);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

router.put("/available/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE inventory SET state = 'available' where id = $1",
			[req.body.inventory_id]
		);
		res.status(200).json({
			status: "success",
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

router.put("/notes/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE sold SET invoice_notes = $1 where id = $2 returning *",
			[req.body.invoice_notes, req.params.id]
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

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query("DELETE from sold where id = $1", [
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
	try {
		const results = await db.query(
			"UPDATE inventory SET state = 'available' where id = $1",
			[req.body.inventory_id]
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
