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
import { shOutboundSchema } from "../../validation/pickup.js";
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
		// LEFT JOIN clients — boxes are intaked without a client (assigned
		// at audit), so an INNER JOIN would hide pending-audit rows entirely.
		// Release joins surface the manifest/origin for the audit screen.
		const results = await db.query(
			`SELECT shi.*, c.client_name, c.business_name,
			        rn.release_number_value, sc.sale_company_name
			 FROM sh_inventory shi
			 LEFT JOIN clients c ON c.id = shi.client_id
			 LEFT JOIN release_numbers rn ON rn.release_number_id = shi.release_number_id
			 LEFT JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
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

// Pickup-receipt data. Mounted before GET /:id so the `/pickup-receipt`
// suffix doesn't get swallowed. Powers the thermal print page after a
// checkout — joins the box to its pickup_number_assignment so the
// printed slip shows pickup #, customer, and operator-entered damage.
router.get("/:id/pickup-receipt", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT shi.id, shi.unit_number, shi.size, shi.damage,
			        shi.intake_date, shi.checkout_date, shi.pickup_damage,
			        c.client_name, c.business_name,
			        pn.pickup_number_value,
			        sc.sale_company_name
			 FROM sh_inventory shi
			 LEFT JOIN clients c ON c.id = shi.client_id
			 LEFT JOIN pickup_number_assignments pna ON pna.sh_inventory_id = shi.id
			 LEFT JOIN pickup_numbers pn ON pn.pickup_number_id = pna.pickup_number_id
			 LEFT JOIN sale_companies sc ON sc.sale_company_id = pn.sale_company_id
			 WHERE shi.id = $1`,
			[req.params.id],
		);
		if (results.rows.length === 0) {
			return res.status(404).json({ message: "Not found" });
		}
		const r = results.rows[0];
		res.status(200).json({
			status: "success",
			data: {
				receipt: {
					sh_inventory_id: r.id,
					unit_number: r.unit_number,
					size: r.size,
					damage: r.damage,
					intake_date: r.intake_date,
					checkout_date: r.checkout_date,
					pickup_damage: r.pickup_damage,
					customer: {
						client_name: r.client_name,
						business_name: r.business_name,
					},
					sale_company_name: r.sale_company_name,
					pickup_number_value: r.pickup_number_value,
				},
			},
		});
	} catch (err) {
		console.error("sh_inventory.pickup-receipt error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT shi.*, c.client_name, c.business_name,
			        rn.release_number_value, sc.sale_company_name
			 FROM sh_inventory shi
			 LEFT JOIN clients c ON c.id = shi.client_id
			 LEFT JOIN release_numbers rn ON rn.release_number_id = shi.release_number_id
			 LEFT JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
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

// Intake submits here with state implicitly 'pending'. Migration 0020:
// no client, no rates, no billing mode at this stage. Admin assigns
// client + billing mode + rates on the audit screen. Migration 0021:
// release_number_id is required at intake, mirroring sales (the box
// physically arrived on some manifest, even before the operator decides
// which customer's billing to attach it to).
router.post(
	"/",
	checkEmployee,
	validateBody(createShInventorySchema),
	async (req, res) => {
		try {
			const b = req.body.box;
			const photos = b.photos && b.photos.length ? b.photos : null;

			const result = await db.query(
				`INSERT INTO sh_inventory (
					unit_number, size, damage, notes, release_number_id,
					intake_date, state, is_pending_audit, photos
				) VALUES (
					$1, $2, $3, $4, $5,
					COALESCE($6::timestamptz, now()),
					'pending', true, $7
				) RETURNING id`,
				[
					b.unit_number,
					b.size,
					b.damage ?? null,
					b.notes ?? null,
					b.release_number_id,
					b.intake_date ?? null,
					photos,
				],
			);

			// Quota bump mirror (sales: routes/v1/inventory.js). A release's
			// quota is set at creation and never decremented; if actual
			// arrivals overshoot it, bump to match so the summary report
			// can't report a nonsense filled/quota ratio. Combined count
			// covers both sales + S&H since a release can hold mixed kinds.
			await db.query(
				`UPDATE release_numbers
				 SET release_number_count = filled.cnt
				 FROM (
				   SELECT (
				     (SELECT COUNT(*)::int FROM inventory
				      WHERE release_number_id = $1)
				     +
				     (SELECT COUNT(*)::int FROM sh_inventory
				      WHERE release_number_id = $1)
				   ) AS cnt
				 ) filled
				 WHERE release_number_id = $1
				   AND release_number_count < filled.cnt`,
				[b.release_number_id],
			);

			// Auto-association mirror (PR 2.8 for sales): if this release has
			// pre-loaded container numbers and one matches the new box, mark
			// the enumeration row used. No-op when no enumeration exists.
			if (b.unit_number) {
				await db.query(
					`UPDATE release_number_containers
					 SET is_used = true
					 WHERE release_number_id = $1 AND container_number = $2`,
					[b.release_number_id, b.unit_number.trim().toUpperCase()],
				);
			}

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

// Admin assigns the client, picks the billing mode, confirms rates
// appropriate to that mode, and clears the pending audit flag. Returns 404
// if the box has already been audited or doesn't exist. For modes other
// than in_out_daily/flat_monthly, the rate fields are explicitly NULL'd —
// keeps the row consistent if an operator switches modes during audit.
//
// Migration 0021 + sales parity: a unit_number rename at audit time
// touches the release_number_containers enumeration. We surface the
// conflict (release this box is on / release the new number is linked
// to) and require explicit confirm_unit_rename before applying — same
// shape as the sales audit endpoint so the UI uses one modal.
router.put(
	"/audit/:id",
	checkAdmin,
	validateBody(auditShInventorySchema),
	async (req, res) => {
		const conn = await db.pool.connect();
		try {
			const b = req.body;
			await conn.query("BEGIN");

			const before = await conn.query(
				`SELECT unit_number, release_number_id
				 FROM sh_inventory
				 WHERE id = $1 AND is_pending_audit = true`,
				[req.params.id],
			);
			if (before.rows.length === 0) {
				await conn.query("ROLLBACK");
				return res
					.status(404)
					.json({ message: "Not found or already audited" });
			}
			const oldUnit = before.rows[0].unit_number;
			const releaseId = before.rows[0].release_number_id;

			// Same rename-conflict gate as routes/v1/inventory.js audit.
			const proposedNorm = (b.unit_number ?? "").trim().toUpperCase();
			const oldNormForCheck = (oldUnit ?? "").trim().toUpperCase();
			if (
				proposedNorm &&
				proposedNorm !== oldNormForCheck &&
				!b.confirm_unit_rename
			) {
				const oldLinked = releaseId
					? await conn.query(
							`SELECT 1 FROM release_number_containers
							 WHERE release_number_id = $1 AND container_number = $2`,
							[releaseId, oldNormForCheck],
						)
					: { rows: [] };
				const newLinked = await conn.query(
					`SELECT rnc.release_number_id, rn.release_number_value,
					        sc.sale_company_name
					 FROM release_number_containers rnc
					 LEFT JOIN release_numbers rn ON rn.release_number_id = rnc.release_number_id
					 LEFT JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
					 WHERE rnc.container_number = $1`,
					[proposedNorm],
				);
				if (oldLinked.rows.length > 0 || newLinked.rows.length > 0) {
					const currentRelease = releaseId
						? await conn.query(
								`SELECT rn.release_number_value, sc.sale_company_name
								 FROM release_numbers rn
								 LEFT JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
								 WHERE rn.release_number_id = $1`,
								[releaseId],
							)
						: { rows: [] };
					await conn.query("ROLLBACK");
					return res.status(409).json({
						status: "conflict",
						code: "unit_rename_confirm_required",
						message:
							"Unit number change touches release enumeration. Confirm to proceed.",
						details: {
							old_unit: oldNormForCheck,
							new_unit: proposedNorm,
							old_unit_in_current_release: oldLinked.rows.length > 0,
							current_release: currentRelease.rows[0] ?? null,
							new_unit_linked_release: newLinked.rows[0]
								? {
										release_number_value:
											newLinked.rows[0].release_number_value,
										sale_company_name: newLinked.rows[0].sale_company_name,
										is_other_release:
											newLinked.rows[0].release_number_id !== releaseId,
									}
								: null,
						},
					});
				}
			}

			const isInOut = b.billing_mode === "in_out_daily";
			const isFlat = b.billing_mode === "flat_monthly";
			const result = await conn.query(
				`UPDATE sh_inventory SET
					client_id = $1,
					billing_mode = $2,
					in_fee = $3,
					out_fee = $4,
					daily_rate = $5,
					flat_rate = $6,
					intake_date = COALESCE($7::timestamptz, intake_date),
					notes = COALESCE($8, notes),
					unit_number = COALESCE($9, unit_number),
					size = COALESCE($10, size),
					damage = COALESCE($11, damage),
					is_pending_audit = false,
					state = CASE WHEN state = 'pending' THEN 'in_storage'::sh_state ELSE state END
				 WHERE id = $12 AND is_pending_audit = true
				 RETURNING id, client_id, billing_mode, state, is_pending_audit, unit_number`,
				[
					b.client_id,
					b.billing_mode,
					isInOut ? b.in_fee ?? null : null,
					isInOut ? b.out_fee ?? null : null,
					isInOut ? b.daily_rate ?? null : null,
					isFlat ? b.flat_rate ?? null : null,
					b.intake_date ?? null,
					b.notes ?? null,
					b.unit_number ?? null,
					b.size ?? null,
					b.damage ?? null,
					req.params.id,
				],
			);
			if (result.rows.length === 0) {
				await conn.query("ROLLBACK");
				return res
					.status(404)
					.json({ message: "Not found or already audited" });
			}

			// Cascade unit_number change to enumeration row (mirrors sales).
			const newNorm = (result.rows[0].unit_number ?? "").trim().toUpperCase();
			if (oldNormForCheck !== newNorm && releaseId) {
				await conn.query(
					`UPDATE release_number_containers
					 SET container_number = $1
					 WHERE release_number_id = $2 AND container_number = $3`,
					[newNorm, releaseId, oldNormForCheck],
				);
			}

			await conn.query("COMMIT");
			res.status(200).json({
				status: "success",
				data: { box: result.rows[0] },
			});
		} catch (err) {
			await conn.query("ROLLBACK").catch(() => {});
			console.error("sh_inventory.audit error:", err);
			res.status(500).json({ message: "Internal server error" });
		} finally {
			conn.release();
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

// Batch outbound — the routine flow for checking S&H boxes out. Picks
// up N boxes under a single pickup number, records operator-entered
// damage per box, flips state to 'checked_out', and atomically updates
// the pickup's is_complete flag if quota was just hit.
//
// Quota race: SELECT ... FOR UPDATE on pickup_numbers serializes any
// concurrent outbounds against the same pickup. SELECT ... FOR UPDATE
// on the chosen sh_inventory rows (sorted ASC by id) prevents two
// operators from outbounding the same box twice. Quota enforcement
// happens INSIDE the lock window, so the second submitter sees the
// first submitter's assignments before deciding whether to commit.
router.post(
	"/outbound",
	checkEmployee,
	validateBody(shOutboundSchema),
	async (req, res) => {
		const { pickup_number_id, outbound_date, boxes } = req.body;
		const conn = await db.pool.connect();
		try {
			await conn.query("BEGIN");

			const pn = await conn.query(
				`SELECT pickup_number_id, pickup_count, is_complete
				 FROM pickup_numbers
				 WHERE pickup_number_id = $1
				 FOR UPDATE`,
				[pickup_number_id],
			);
			if (pn.rows.length === 0) {
				await conn.query("ROLLBACK");
				return res
					.status(404)
					.json({ code: "pickup_not_found", message: "Pickup not found" });
			}
			if (pn.rows[0].is_complete) {
				await conn.query("ROLLBACK");
				return res.status(409).json({
					code: "pickup_already_complete",
					message: "Pickup is already complete.",
				});
			}

			const used = await conn.query(
				`SELECT COUNT(*)::int AS n
				 FROM pickup_number_assignments
				 WHERE pickup_number_id = $1`,
				[pickup_number_id],
			);
			const usedCount = used.rows[0].n;
			const quota = pn.rows[0].pickup_count;
			if (usedCount + boxes.length > quota) {
				await conn.query("ROLLBACK");
				return res.status(409).json({
					code: "pickup_over_quota",
					message: `Would exceed pickup quota: ${usedCount} used + ${boxes.length} requested > ${quota}.`,
					details: { used: usedCount, requested: boxes.length, quota },
				});
			}

			const ids = boxes.map((b) => Number(b.sh_inventory_id)).sort((a, b) => a - b);
			const rows = await conn.query(
				`SELECT id, state FROM sh_inventory
				 WHERE id = ANY($1::int[])
				 FOR UPDATE`,
				[ids],
			);
			if (rows.rows.length !== ids.length) {
				await conn.query("ROLLBACK");
				const found = new Set(rows.rows.map((r) => r.id));
				const missing = ids.find((id) => !found.has(id));
				return res.status(404).json({
					code: "box_not_found",
					message: `Box not found: ${missing}`,
					details: { sh_inventory_id: missing },
				});
			}
			for (const r of rows.rows) {
				if (r.state !== "in_storage") {
					await conn.query("ROLLBACK");
					return res.status(409).json({
						code: "box_not_in_storage",
						message: `Box ${r.id} is in state '${r.state}', expected 'in_storage'.`,
						details: { sh_inventory_id: r.id, state: r.state },
					});
				}
			}

			for (const b of boxes) {
				const damage = (b.pickup_damage ?? "").trim() || "Out good";
				await conn.query(
					`INSERT INTO pickup_number_assignments
					   (sh_inventory_id, pickup_number_id, pickup_damage)
					 VALUES ($1, $2, $3)`,
					[b.sh_inventory_id, pickup_number_id, damage],
				);
				await conn.query(
					`UPDATE sh_inventory
					 SET state = 'checked_out',
					     checkout_date = $1,
					     pickup_damage = $2
					 WHERE id = $3`,
					[outbound_date, damage, b.sh_inventory_id],
				);
			}

			// Auto-complete on quota hit. Recompute inside the lock so we
			// don't trip on stale counts.
			const completedRes = await conn.query(
				`UPDATE pickup_numbers
				 SET is_complete = true, completed_at = now()
				 WHERE pickup_number_id = $1
				   AND (SELECT COUNT(*) FROM pickup_number_assignments
				        WHERE pickup_number_id = $1) >= pickup_count
				 RETURNING pickup_number_id`,
				[pickup_number_id],
			);
			const pickupComplete = completedRes.rows.length > 0;

			await conn.query("COMMIT");
			res.status(200).json({
				status: "success",
				data: {
					checked_out: ids,
					receipt_box_ids: ids,
					pickup_complete: pickupComplete,
				},
			});
		} catch (err) {
			await conn.query("ROLLBACK").catch(() => {});
			console.error("sh_inventory.outbound error:", err);
			res.status(500).json({ message: "Internal server error" });
		} finally {
			conn.release();
		}
	},
);

// Admin-only single-box checkout — legacy override path retained for
// one-off corrections. Routine outbound flows through POST /outbound
// above, which enforces pickup-number quota.
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
// constraint as sales inventory (no invoice FK pointing at them). Mirrors
// sales: if the box was auto-associated against a release_number_containers
// enumeration row, reopen that slot so the unit number can be re-entered.
router.delete("/:id", checkAdmin, async (req, res) => {
	const conn = await db.pool.connect();
	try {
		await conn.query("BEGIN");
		const before = await conn.query(
			`SELECT release_number_id, unit_number
			 FROM sh_inventory WHERE id = $1`,
			[req.params.id],
		);
		if (before.rows.length === 0) {
			await conn.query("ROLLBACK");
			return res.status(404).json({ message: "Not found" });
		}
		const { release_number_id, unit_number } = before.rows[0];

		await conn.query("DELETE FROM sh_inventory WHERE id = $1", [req.params.id]);

		if (release_number_id && unit_number) {
			await conn.query(
				`UPDATE release_number_containers
				 SET is_used = false
				 WHERE release_number_id = $1 AND container_number = $2`,
				[release_number_id, unit_number.trim().toUpperCase()],
			);
		}
		await conn.query("COMMIT");
		res.status(200).json({ status: "success" });
	} catch (err) {
		await conn.query("ROLLBACK").catch(() => {});
		console.error("sh_inventory.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	} finally {
		conn.release();
	}
});

export default router;
