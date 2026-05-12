import express from "express";
import { desc } from "drizzle-orm";
import db from "../../db/index.js";
import { db as drizzleDb } from "../../db/drizzle.js";
import { inventory } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

router.get("/", checkEmployee, async (req, res) => {
	try {
		const rows = await drizzleDb
			.select()
			.from(inventory)
			.orderBy(desc(inventory.date));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { inventory: rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory where id = $1",
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

router.put("/state", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory WHERE state=$1 ORDER BY id",
			[req.body.state]
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

router.post("/add", checkEmployee, async (req, res) => {
	try {
		const { container, release } = req.body;
		const releaseId = release[0].release_number_id;
		const newCount = release[0].release_number_count - 1;

		// release_number_id comes from the picker; sale_company_id is inherited
		// from the release since every container's sale_company should match its
		// release. The legacy acceptance_number / sale_company text columns
		// (still in the request body for backwards compat) are now ignored —
		// PR 1.6 dropped them once every container had a proper FK.
		await db.query(
			`INSERT INTO inventory (
				date, unit_number, size, damage, trucking_company,
				state, notes, acquisition_price,
				release_number_id, sale_company_id, is_pending_audit
			) VALUES (
				CURRENT_TIMESTAMP, $1, $2, $3, $4,
				$5, $6, $7,
				$8,
				(SELECT sale_company_id FROM release_numbers WHERE release_number_id = $8),
				true
			)`,
			[
				container.unit_number,
				container.size,
				container.damage,
				container.trucking_company,
				container.state || "available",
				container.notes,
				container.acquisition_price,
				releaseId,
			]
		);

		// Decrement release count; mark complete when it hits 0
		// (replaces the legacy DELETE-when-empty pattern per PLAN §4.3).
		if (newCount <= 0) {
			await db.query(
				"UPDATE release_numbers SET release_number_count = 0, is_complete = true, completed_at = now() WHERE release_number_id = $1",
				[releaseId]
			);
		} else {
			await db.query(
				"UPDATE release_numbers SET release_number_count = $1 WHERE release_number_id = $2",
				[newCount, releaseId]
			);
		}

		res.status(200).json({
			status: "success",
			data: { completed: newCount <= 0 },
		});
	} catch (err) {
		console.error("inventory.add error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/:id", checkAdmin, async (req, res) => {
	try {
		// acceptance_number / sale_company in req.body are accepted but ignored —
		// the source of truth is release_number_id / sale_company_id (both
		// non-null after PR 1.6). Phase 2's audit flow will let admins reassign
		// the release; for now the legacy edit form can only tweak the other
		// fields without breaking anything if those inputs are filled in.
		const results = await db.query(
			"UPDATE inventory SET unit_number = $1, size = $2, damage = $3, trucking_company = $4, state = $5, acquisition_price = $6 where id = $7 returning *",
			[
				req.body.unit_number,
				req.body.size,
				req.body.damage,
				req.body.trucking_company,
				req.body.state,
				req.body.acquisition_price,
				req.params.id,
			]
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

router.put("/notes/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE inventory SET notes = $1 where id = $2 returning *",
			[req.body.notes, req.params.id]
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

router.put("/state/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			"UPDATE inventory SET state = $1 where id = $2 returning *",
			[req.body.state, req.params.id]
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

router.put("/outbound/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"UPDATE inventory SET state = 'outbound' WHERE id = $1",
			[req.params.id]
		);
		const results = await db.query(
			"UPDATE sold SET outbound_date = CURRENT_TIMESTAMP WHERE inventory_id = $1 RETURNING outbound_date",
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

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const results = await db.query("DELETE FROM inventory WHERE id = $1", [
			req.params.id,
		]);
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
