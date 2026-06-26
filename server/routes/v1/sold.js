import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id ORDER BY sold.id"
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

router.get("/:unitNumber", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id where inventory.unit_number=$1",
			[req.params.unitNumber]
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

router.post("/", checkAdmin, async (req, res) => {
	try {
		// modification_price was previously DEFAULT 0; now nullable. Translate
		// 0 / "" / missing → NULL so new rows match the post-backfill semantics
		// ("not recorded" vs "we know it was free"). Phase 2 audit flow gives
		// admins a proper way to record mod costs.
		const modRaw = req.body.modification_price;
		const modPrice =
			modRaw === undefined ||
			modRaw === null ||
			modRaw === "" ||
			Number(modRaw) === 0
				? null
				: modRaw;

		await db.query(
			"INSERT INTO sold (inventory_id, sold_date, destination, sale_price, release_number, trucking_rate, modification_price, invoice_notes) VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7)",
			[
				req.body.id,
				req.body.destination,
				req.body.sale_price,
				req.body.release_number,
				req.body.trucking_rate,
				modPrice,
				req.body.invoice_notes,
			]
		);
		await db.query("UPDATE inventory SET state = 'sold' where id = $1", [
			req.body.id,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

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
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/deliverysheet/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"UPDATE sold SET outbound_trucker = $1, outbound_date = $2 WHERE inventory_id = $3",
			[req.body.outbound_trucker, req.body.outbound_date, req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/available/:id", checkAdmin, async (req, res) => {
	// Historically this read req.body.inventory_id and ignored the :id route
	// param entirely. Prefer the param (canonical) and fall back to the body
	// for any legacy caller; validate a positive integer either way.
	const fromParam = Number.parseInt(req.params.id, 10);
	const inventoryId =
		Number.isInteger(fromParam) && fromParam > 0
			? fromParam
			: Number(req.body?.inventory_id);
	if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
		return res.status(400).json({ message: "invalid inventory id" });
	}
	try {
		await db.query("UPDATE inventory SET state = 'available' WHERE id = $1", [
			inventoryId,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		req.log.error({ err }, "sold set-available failed");
		res.status(500).json({ message: "Internal server error" });
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
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
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
			data: { inventory: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
