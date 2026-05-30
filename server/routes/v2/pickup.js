import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	createPickupSchema,
	createPickupCompanySchema,
} from "../../validation/pickup.js";

const router = express.Router();

const groupPickups = (data) => {
	let out = [];
	for (const row of data) {
		let bucket = out.find((c) => c.id === row.sale_company_id);
		if (!bucket) {
			bucket =
				out[
					out.push({
						id: row.sale_company_id,
						company: row.sale_company_name,
						numbers: [],
					}) - 1
				];
		}
		if (
			row.pickup_number_id &&
			row.pickup_count !== null &&
			row.pickup_number_value
		) {
			bucket.numbers.push({
				pickup_id: row.pickup_number_id,
				pickup_count: row.pickup_count,
				pickup_number: row.pickup_number_value,
				assignment_count: Number(row.assignment_count ?? 0),
				is_complete: row.is_complete,
			});
		}
	}
	return out;
};

// All live pickups (active + filled), grouped by sale company. The
// admin page's Active/Filled tabs split client-side on
// assignment_count vs pickup_count. Soft-deleted pickups
// (is_complete=true with completed_at set by the DELETE handler) stay
// in this list — the Filled tab is meant to surface them.
router.get("/", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT sc.sale_company_name, sc.sale_company_id,
			        pn.pickup_number_id, pn.pickup_number_value, pn.pickup_count,
			        pn.is_complete,
			        (SELECT COUNT(*)::int FROM pickup_number_assignments pna
			         WHERE pna.pickup_number_id = pn.pickup_number_id) AS assignment_count
			 FROM sale_companies sc
			 LEFT JOIN pickup_numbers pn ON pn.sale_company_id = sc.sale_company_id
			 ORDER BY sc.sale_company_id`
		);
		const pickups = groupPickups(results.rows);
		res.status(200).json({
			status: "success",
			results: pickups.length,
			data: { pickups },
		});
	} catch (err) {
		console.error("pickup.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Flat list of unfilled pickups — feeds the outbound dropdown. Returns
// remaining slots so the picker can render "PU-123 — 3 of 10 left".
router.get("/numbers", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT pn.pickup_number_id, pn.pickup_number_value, pn.pickup_count,
			        pn.sale_company_id, sc.sale_company_name,
			        (SELECT COUNT(*)::int FROM pickup_number_assignments pna
			         WHERE pna.pickup_number_id = pn.pickup_number_id) AS assignment_count
			 FROM pickup_numbers pn
			 JOIN sale_companies sc ON sc.sale_company_id = pn.sale_company_id
			 WHERE pn.is_complete = false
			 ORDER BY sc.sale_company_name, pn.pickup_number_value`
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { pickups: results.rows },
		});
	} catch (err) {
		console.error("pickup.numbers error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(createPickupSchema),
	async (req, res) => {
		try {
			const results = await db.query(
				`INSERT INTO pickup_numbers (sale_company_id, pickup_number_value, pickup_count)
				 VALUES ($1, $2, $3)
				 RETURNING pickup_number_id`,
				[req.body.company_id, req.body.number, req.body.pickup_count]
			);
			res.status(200).json({
				status: "success",
				results: results.rows.length,
				data: results.rows,
			});
		} catch (err) {
			// Globally-unique pickup_number_value mirrors release semantics.
			if (err.code === "23505") {
				return res.status(409).json({
					message: "That pickup number already exists.",
				});
			}
			console.error("pickup.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	}
);

router.post(
	"/company",
	checkAdmin,
	validateBody(createPickupCompanySchema),
	async (req, res) => {
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
			console.error("pickup.createCompany error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	}
);

// Edit quota on an existing pickup. Reject if new quota < live
// assignment count — pickups must never be retroactively over-enrolled.
// If the new quota raises the ceiling above the assigned count and the
// pickup was previously auto-completed, flip is_complete back to false
// so the operator can keep adding boxes.
router.patch("/:id/quota", checkAdmin, async (req, res) => {
	try {
		const pickupId = Number(req.params.id);
		const newQuota = Number(req.body.pickup_count);
		if (!Number.isInteger(pickupId) || !Number.isInteger(newQuota) || newQuota < 1) {
			return res.status(400).json({ message: "Invalid quota" });
		}
		const usedRes = await db.query(
			`SELECT COUNT(*)::int AS used
			 FROM pickup_number_assignments
			 WHERE pickup_number_id = $1`,
			[pickupId],
		);
		const used = usedRes.rows[0]?.used ?? 0;
		if (newQuota < used) {
			return res.status(409).json({
				code: "quota_below_used",
				message: `Pickup already has ${used} box${used === 1 ? "" : "es"} assigned; quota can't drop below that.`,
				details: { used, requested: newQuota },
			});
		}
		const upd = await db.query(
			`UPDATE pickup_numbers
			 SET pickup_count = $1,
			     is_complete = CASE WHEN $1 > $2 THEN false ELSE is_complete END,
			     completed_at = CASE WHEN $1 > $2 THEN NULL ELSE completed_at END
			 WHERE pickup_number_id = $3
			 RETURNING pickup_number_id`,
			[newQuota, used, pickupId],
		);
		if (upd.rows.length === 0) {
			return res.status(404).json({ message: "Pickup not found" });
		}
		res.status(200).json({ status: "success" });
	} catch (err) {
		console.error("pickup.quota error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Soft-delete (mirror of release DELETE). ON DELETE RESTRICT on the
// assignments FK would block a hard delete with attached boxes anyway.
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			`UPDATE pickup_numbers
			 SET is_complete = true,
			     completed_at = COALESCE(completed_at, now())
			 WHERE pickup_number_id = $1`,
			[req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		console.error("pickup.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Drawer endpoint — assigned boxes under a pickup.
router.get("/:id/assignments", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT pna.sh_inventory_id, pna.assigned_at, pna.pickup_damage,
			        shi.unit_number, shi.size, shi.intake_date, shi.checkout_date,
			        shi.state::text AS state,
			        COALESCE(cl.business_name, cl.client_name) AS customer_label
			 FROM pickup_number_assignments pna
			 JOIN sh_inventory shi ON shi.id = pna.sh_inventory_id
			 LEFT JOIN clients cl ON cl.id = shi.client_id
			 WHERE pna.pickup_number_id = $1
			 ORDER BY pna.assigned_at ASC, pna.sh_inventory_id ASC`,
			[req.params.id]
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { assignments: results.rows },
		});
	} catch (err) {
		console.error("pickup.assignments error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Admin detach — rare, used to correct an outbound. Recomputes
// is_complete in the same statement so the pickup can flow back into
// the Active list if it was filled prior.
router.delete(
	"/:id/assignments/:sh_inventory_id",
	checkAdmin,
	async (req, res) => {
		try {
			const pickupId = Number(req.params.id);
			const boxId = Number(req.params.sh_inventory_id);
			await db.query(
				`DELETE FROM pickup_number_assignments
				 WHERE pickup_number_id = $1 AND sh_inventory_id = $2`,
				[pickupId, boxId]
			);
			await db.query(
				`UPDATE pickup_numbers
				 SET is_complete = false, completed_at = NULL
				 WHERE pickup_number_id = $1
				   AND (SELECT COUNT(*) FROM pickup_number_assignments
				        WHERE pickup_number_id = $1) < pickup_count`,
				[pickupId]
			);
			res.status(200).json({ status: "success" });
		} catch (err) {
			console.error("pickup.detach error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	}
);

router.delete("/company/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"DELETE FROM sale_companies WHERE sale_company_id=$1",
			[req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		console.error("pickup.deleteCompany error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
