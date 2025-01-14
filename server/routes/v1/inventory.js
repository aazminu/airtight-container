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

router.get("/", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory ORDER BY date DESC"
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

router.get("/:id", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory where id = $1",
			[req.params.id]
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

router.put("/state", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory WHERE state=$1 ORDER BY id",
			[req.body.state]
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
router.post("/add", checkAuth, async (req, res) => {
	try {
		let deleteRelease = false;
		// Alter the release # count of the acceptance number used. If 1, remove
		// release from table
		const results = await db.query(
			"INSERT INTO inventory (date, unit_number, size, damage, trucking_company, acceptance_number, sale_company, state, notes, aquisition_price) VALUES (CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7, $8, $9) returning *",
			[
				req.body.container.unit_number,
				req.body.container.size,
				req.body.container.damage,
				req.body.container.trucking_company,
				req.body.container.acceptance_number,
				req.body.container.sale_company,
				req.body.container.state,
				req.body.container.notes,
				req.body.container.aquisition_price,
			]
		);
		if (req.body.release[0].release_number_count === 1) {
			console.log("DELETING RELEASE");
			deleteRelease = true;
			await db.query(
				"DELETE FROM release_numbers WHERE release_number_id = $1",
				[req.body.release[0].release_number_id]
			);
			// Else decrement it.
		} else {
			console.log("DECREMENTING RELEASE");
			const newCount = req.body.release[0].release_number_count - 1;
			console.log("NEW COUNT == " + newCount);
			await db.query(
				"UPDATE release_numbers SET release_number_count = $1 WHERE release_number_id = $2",
				[newCount, req.body.release[0].release_number_id]
			);
		}
		res.status(200).json({
			status: "success",
			data: {
				deleted: deleteRelease,
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
			"UPDATE inventory SET unit_number = $1, size = $2, damage = $3, trucking_company = $4, acceptance_number = $5, sale_company = $6, state = $7, aquisition_price = $8 where id = $9 returning *",
			[
				req.body.unit_number,
				req.body.size,
				req.body.damage,
				req.body.trucking_company,
				req.body.acceptance_number,
				req.body.sale_company,
				req.body.state,
				req.body.aquisition_price,
				req.params.id,
			]
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

router.put("/notes/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE inventory SET notes = $1 where id = $2 returning *",
			[req.body.notes, req.params.id]
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

router.put("/state/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE inventory SET state = $1 where id = $2 returning *",
			[req.body.state, req.params.id]
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

router.put("/outbound/:id", checkAdmin, async (req, res) => {
	try {
		// NOTE THIS TAKES INVENTORY ID
		await db.query(
			"UPDATE inventory SET state = 'outbound' WHERE id = $1",
			[req.params.id]
		);
		// AND THIS TAKES SOLD ID-- the woes of refactor
		const results = await db.query(
			"UPDATE sold SET outbound_date = CURRENT_TIMESTAMP WHERE inventory_id = $1 RETURNING outbound_date",
			[req.params.id]
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
		const results = await db.query("DELETE FROM inventory WHERE id = $1", [
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
