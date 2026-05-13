import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	createShInventorySchema,
	auditShInventorySchema,
	checkoutShInventorySchema,
	allowedNextStates,
} from "../../validation/sh_inventory.js";
import { presignedGet } from "../../lib/s3.js";

const router = express.Router();

// Best-effort presigning: degrade to null when AWS env is missing
// rather than 500-ing the whole list.
async function attachPhotoUrls(rows) {
	return Promise.all(
		rows.map(async (r) => {
			if (!Array.isArray(r.photos) || r.photos.length === 0) {
				return { ...r, photo_urls: null };
			}
			try {
				const urls = await Promise.all(r.photos.map((k) => presignedGet(k)));
				return { ...r, photo_urls: urls };
			} catch (err) {
				console.error("presign error for sh_inventory row", r.id, err);
				return { ...r, photo_urls: null };
			}
		}),
	);
}

// ---- list / get ---------------------------------------------------

// GET /api/v2/sh-inventory?state=pending — list, optionally filtered by state.
// Sort: most recently arrived first. Joins clients for the display name.
// PR 2.6: photo_urls are attached for the pending list (audit screen
// consumer); other consumers don't need them and can pay the cost when
// they do.
router.get("/", checkEmployee, async (req, res) => {
	try {
		const state = req.query.state;
		const params = [];
		let where = "";
		if (state) {
			params.push(state);
			where = "WHERE shi.state = $1";
		}
		const results = await db.query(
			`SELECT shi.*, c.client_name, c.business_name
			 FROM sh_inventory shi
			 JOIN clients c ON c.id = shi.client_id
			 ${where}
			 ORDER BY shi.intake_date DESC`,
			params,
		);
		const enriched =
			state === "pending"
				? await attachPhotoUrls(results.rows)
				: results.rows;
		res.status(200).json({
			status: "success",
			results: enriched.length,
			data: { boxes: enriched },
		});
	} catch (err) {
		console.error("sh_inventory.get error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT shi.*, c.client_name, c.business_name
			 FROM sh_inventory shi
			 JOIN clients c ON c.id = shi.client_id
			 WHERE shi.id = $1`,
			[req.params.id],
		);
		if (results.rows.length === 0) {
			return res.status(404).json({ message: "Not found" });
		}
		res.status(200).json({
			status: "success",
			data: { box: results.rows[0] },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

// ---- create -------------------------------------------------------

// Intake submits here with state implicitly 'pending'. Admin audits via
// PUT /audit/:id and PUT /state/:id to promote to in_storage.
router.post(
	"/",
	checkEmployee,
	validateBody(createShInventorySchema),
	async (req, res) => {
		try {
			const b = req.body.box;
			const photos = b.photos && b.photos.length ? b.photos : null;

			// PR 2.8.1: yard staff no longer types rates during intake. When
			// the client doesn't supply them, fall back to the client's
			// configured defaults so the NOT NULL columns get filled. Admin
			// can override on the audit screen.
			let { in_fee, out_fee, daily_rate } = b;
			if (in_fee === undefined || out_fee === undefined || daily_rate === undefined) {
				const cli = await db.query(
					"SELECT default_in_fee, default_out_fee, default_daily_rate FROM clients WHERE id = $1",
					[b.client_id],
				);
				if (cli.rows.length === 0) {
					return res.status(400).json({ message: "Client not found" });
				}
				const d = cli.rows[0];
				if (in_fee === undefined) in_fee = d.default_in_fee;
				if (out_fee === undefined) out_fee = d.default_out_fee;
				if (daily_rate === undefined) daily_rate = d.default_daily_rate;
			}

			const result = await db.query(
				`INSERT INTO sh_inventory (
					client_id, unit_number, size, damage, notes,
					in_fee, out_fee, daily_rate,
					intake_date, state, is_pending_audit, photos
				) VALUES (
					$1, $2, $3, $4, $5,
					$6, $7, $8,
					COALESCE($9::timestamptz, now()),
					'pending', true, $10
				) RETURNING id`,
				[
					b.client_id,
					b.unit_number,
					b.size,
					b.damage ?? null,
					b.notes ?? null,
					in_fee,
					out_fee,
					daily_rate,
					b.intake_date ?? null,
					photos,
				],
			);
			res.status(201).json({
				status: "success",
				data: { id: result.rows[0].id },
			});
		} catch (err) {
			console.error("sh_inventory.post error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

// ---- admin audit --------------------------------------------------

// Admin confirms or adjusts rates / intake_date and clears the pending
// audit flag. Returns 404 if the box has already been audited or doesn't exist.
router.put(
	"/audit/:id",
	checkAdmin,
	validateBody(auditShInventorySchema),
	async (req, res) => {
		try {
			const b = req.body;
			const result = await db.query(
				`UPDATE sh_inventory SET
					in_fee = COALESCE($1, in_fee),
					out_fee = COALESCE($2, out_fee),
					daily_rate = COALESCE($3, daily_rate),
					intake_date = COALESCE($4::timestamptz, intake_date),
					notes = COALESCE($5, notes),
					unit_number = COALESCE($6, unit_number),
					size = COALESCE($7, size),
					damage = COALESCE($8, damage),
					is_pending_audit = false,
					state = CASE WHEN state = 'pending' THEN 'in_storage'::sh_state ELSE state END
				 WHERE id = $9 AND is_pending_audit = true
				 RETURNING id, state, is_pending_audit`,
				[
					b.in_fee ?? null,
					b.out_fee ?? null,
					b.daily_rate ?? null,
					b.intake_date ?? null,
					b.notes ?? null,
					b.unit_number ?? null,
					b.size ?? null,
					b.damage ?? null,
					req.params.id,
				],
			);
			if (result.rows.length === 0) {
				return res
					.status(404)
					.json({ message: "Not found or already audited" });
			}
			res.status(200).json({
				status: "success",
				data: { box: result.rows[0] },
			});
		} catch (err) {
			console.error("sh_inventory.audit error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

// ---- state transitions --------------------------------------------

// PUT /state/:id — explicit state transition. Validates the transition is
// legal per allowedNextStates() before writing. PR 2.4 will use this for
// the audit screen's "Promote to in_storage" action.
router.put("/state/:id", checkAdmin, async (req, res) => {
	try {
		const target = req.body.state;
		const current = await db.query(
			"SELECT state FROM sh_inventory WHERE id = $1",
			[req.params.id],
		);
		if (current.rows.length === 0) {
			return res.status(404).json({ message: "Not found" });
		}
		const allowed = allowedNextStates(current.rows[0].state);
		if (!allowed.includes(target)) {
			return res.status(400).json({
				message: `Cannot transition from ${current.rows[0].state} to ${target}`,
			});
		}
		await db.query("UPDATE sh_inventory SET state = $1 WHERE id = $2", [
			target,
			req.params.id,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

// Check-out flow — sets checkout_date and transitions state to 'checked_out'.
// Validates the box is in 'in_storage' state first.
router.put(
	"/checkout/:id",
	checkAdmin,
	validateBody(checkoutShInventorySchema),
	async (req, res) => {
		try {
			const current = await db.query(
				"SELECT state FROM sh_inventory WHERE id = $1",
				[req.params.id],
			);
			if (current.rows.length === 0) {
				return res.status(404).json({ message: "Not found" });
			}
			if (current.rows[0].state !== "in_storage") {
				return res.status(400).json({
					message: `Cannot check out a box in state ${current.rows[0].state}`,
				});
			}
			await db.query(
				`UPDATE sh_inventory SET
					checkout_date = $1,
					state = 'checked_out'
				 WHERE id = $2`,
				[req.body.checkout_date, req.params.id],
			);
			res.status(200).json({ status: "success" });
		} catch (err) {
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

// ---- delete -------------------------------------------------------

// Admin-only. No soft-delete — S&H boxes don't have the same historical-record
// constraint as sales inventory (no invoice FK pointing at them).
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query("DELETE FROM sh_inventory WHERE id = $1", [req.params.id]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
