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

// Helper function to format releases in a nice way with data taken from db.
const groupReleases = (data) => {
	let finalObj = [];
	for (const release of data) {
		let currObj = {};
		currObj = finalObj.find(
			(company) => company.id == release.sale_company_id
		);
		if (!currObj) {
			// This is really scuffed but obj.push returns length of new arr
			// so this sets currObj to the latest added object which should be
			// the one just added which would be the proper company obj
			currObj =
				finalObj[
					finalObj.push({
						id: release.sale_company_id,
						company: release.sale_company_name,
						numbers: [],
					}) - 1
				];
		}
		// Make sure release values are not-null (This makes empty companies have empty numbers[] lists)
		if (
			release.release_number_id &&
			release.release_number_count &&
			release.release_number_value
		) {
			currObj.numbers.push({
				release_id: release.release_number_id,
				release_count: release.release_number_count,
				release_number: release.release_number_value,
			});
		}
	}

	return finalObj;
};

//GETS
router.get("/", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT sc.sale_company_name, sc.sale_company_id, rn.release_number_id, rn.release_number_count, rn.release_number_value FROM sale_companies sc LEFT JOIN release_numbers rn ON rn.sale_company_id = sc.sale_company_id ORDER BY sc.sale_company_id"
		);
		let releases = groupReleases(results.rows);
		res.status(200).json({
			status: "success",
			results: releases.length,
			data: {
				releases: releases,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

router.get("/numbers", checkAuth, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT release_number_id, release_number_count, release_number_value FROM release_numbers"
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: {
				releases: results.rows,
			},
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

//POSTS

// Add a release number under a given company, expects ID of company, #, and ct.
router.post("/", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO release_numbers (sale_company_id, release_number_value, release_number_count) VALUES ($1, $2, $3) RETURNING release_number_id",
			[req.body.company_id, req.body.number, req.body.box_count]
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: results.rows,
		});
	} catch (err) {
		console.log(err);
		res.status(400);
	}
});

// Add a company to the dashboard, expects a company name in body.
router.post("/company", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO sale_companies (sale_company_name) VALUES ($1)",
			[req.body.name]
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

// NO PUTS

//DELETES

// deletes a given release # by ID
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"DELETE FROM release_numbers where release_number_id=$1",
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

// Delete a given company, takes the company id
router.delete("/company/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"DELETE FROM sale_companies where sale_company_id=$1",
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

module.exports = router;
