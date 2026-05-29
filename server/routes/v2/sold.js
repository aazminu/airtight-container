// Per-container sold-row patches.
//
// Operator can edit per-container delivery details (door orientation,
// carrier, delivery address) two places: on the invoice form, and on the
// delivery-sheet stepper Details step. The stepper hits this endpoint
// before submitting the report so the sold row stays canonical and
// future sheets / invoice views see the latest values.

import express from "express";
import pool from "../../db/pool.js";
import { checkEmployee } from "../../middleware/auth.js";

const router = express.Router();

const ALLOWED_FIELDS = [
	"door_orientation",
	"outbound_trucking_company_id",
	"delivery_name",
	"delivery_street",
	"delivery_city",
	"delivery_state",
	"delivery_zip",
];

router.patch("/:inventory_id", checkEmployee, async (req, res) => {
	const inventoryId = parseInt(req.params.inventory_id, 10);
	if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
		return res
			.status(400)
			.json({ status: "error", message: "invalid inventory_id" });
	}

	const updates = {};
	for (const key of ALLOWED_FIELDS) {
		if (key in req.body) {
			const raw = req.body[key];
			// Empty string → null so the column clears cleanly.
			updates[key] = raw === "" ? null : raw;
		}
	}
	if (Object.keys(updates).length === 0) {
		return res
			.status(400)
			.json({ status: "error", message: "no fields to update" });
	}

	const setParts = [];
	const params = [];
	let i = 1;
	for (const [k, v] of Object.entries(updates)) {
		setParts.push(`${k} = $${i}`);
		params.push(v);
		i += 1;
	}
	params.push(inventoryId);

	try {
		const { rows } = await pool.query(
			`UPDATE sold SET ${setParts.join(", ")}
       WHERE inventory_id = $${i}
       RETURNING id`,
			params,
		);
		if (rows.length === 0) {
			return res
				.status(404)
				.json({ status: "error", message: "no sold row for this container" });
		}
		res.json({ status: "success", data: { sold_id: rows[0].id } });
	} catch (err) {
		// FK violation on outbound_trucking_company_id → 400.
		if (err && (err.code === "23503" || err.cause?.code === "23503")) {
			return res
				.status(400)
				.json({ status: "error", message: "Invalid trucking company id." });
		}
		console.error("sold.patch error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
