import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

const groupReleases = (data) => {
	let finalObj = [];
	for (const release of data) {
		let currObj = finalObj.find(
			(company) => company.id == release.sale_company_id
		);
		if (!currObj) {
			currObj =
				finalObj[
					finalObj.push({
						id: release.sale_company_id,
						company: release.sale_company_name,
						numbers: [],
					}) - 1
				];
		}
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

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT sc.sale_company_name, sc.sale_company_id, rn.release_number_id, rn.release_number_count, rn.release_number_value FROM sale_companies sc LEFT JOIN release_numbers rn ON rn.sale_company_id = sc.sale_company_id ORDER BY sc.sale_company_id"
		);
		const releases = groupReleases(results.rows);
		res.status(200).json({
			status: "success",
			results: releases.length,
			data: { releases },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/numbers", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT release_number_id, release_number_count, release_number_value FROM release_numbers"
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { releases: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

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
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post("/company", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"INSERT INTO sale_companies (sale_company_name) VALUES ($1)",
			[req.body.name]
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"DELETE FROM release_numbers where release_number_id=$1",
			[req.params.id]
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.delete("/company/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"DELETE FROM sale_companies where sale_company_id=$1",
			[req.params.id]
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
