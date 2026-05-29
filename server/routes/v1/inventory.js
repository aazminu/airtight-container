import express from "express";
import { desc, eq } from "drizzle-orm";
import db from "../../db/index.js";
import { db as drizzleDb } from "../../db/drizzle.js";
import {
	inventory,
	sale_companies,
	release_numbers,
	sold,
	invoice_containers,
	invoices,
} from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { auditInventorySchema } from "../../validation/inventory.js";
import { presignedGet } from "../../lib/s3.js";

const router = express.Router();

// Best-effort presigning: if AWS env vars are missing the URL helper
// throws; we degrade to null photo_urls so the UI just shows no
// thumbnails rather than the whole list call failing.
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
				console.error("presign error for inventory row", r.id, err);
				return { ...r, photo_urls: null };
			}
		}),
	);
}

// GET /api/v1/inventory?pending_audit=true → filter to rows the audit
// screen (PR 2.5) needs. Default list keeps the legacy behavior of
// returning everything.
// PR 2.6: when pending_audit is set, also attach presigned GET URLs for
// each stored photo key so the audit screen can render thumbnails
// without a per-row round-trip.
// PR 4.1: list now LEFT JOINs sale_companies + release_numbers, plus
// sold + invoice_containers + invoices so the tabbed inventory page can
// render Sale Co. / Release# columns and the sold tab can surface
// outbound_date + invoice_number without a per-row round-trip. Joins
// stay LEFT so non-sold inventory rows still come back.
router.get("/", checkEmployee, async (req, res) => {
	try {
		const wantsPending = req.query.pending_audit === "true";
		const rows = await drizzleDb
			.select({
				id: inventory.id,
				date: inventory.date,
				unit_number: inventory.unit_number,
				size: inventory.size,
				damage: inventory.damage,
				trucking_company: inventory.trucking_company,
				release_number_id: inventory.release_number_id,
				sale_company_id: inventory.sale_company_id,
				notes: inventory.notes,
				acquisition_price: inventory.acquisition_price,
				state: inventory.state,
				is_pending_audit: inventory.is_pending_audit,
				photos: inventory.photos,
				sale_company_name: sale_companies.sale_company_name,
				release_number_value: release_numbers.release_number_value,
				outbound_date: sold.outbound_date,
				invoice_number: invoices.invoice_number,
				invoice_id: invoices.invoice_id,
			})
			.from(inventory)
			.leftJoin(
				sale_companies,
				eq(inventory.sale_company_id, sale_companies.sale_company_id),
			)
			.leftJoin(
				release_numbers,
				eq(inventory.release_number_id, release_numbers.release_number_id),
			)
			.leftJoin(sold, eq(sold.inventory_id, inventory.id))
			.leftJoin(
				invoice_containers,
				eq(invoice_containers.container_id, inventory.id),
			)
			.leftJoin(
				invoices,
				eq(invoices.invoice_id, invoice_containers.invoice_id),
			)
			.where(wantsPending ? eq(inventory.is_pending_audit, true) : undefined)
			.orderBy(desc(inventory.date));
		const enriched = wantsPending ? await attachPhotoUrls(rows) : rows;
		res.status(200).json({
			status: "success",
			results: enriched.length,
			data: { inventory: enriched },
		});
	} catch (err) {
		console.error("inventory.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// PR 4.2: detail GET attaches presigned photo URLs so the editor can
// render a lightbox strip on demand without precomputing URLs for every
// row in the list response.
router.get("/:id", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"select * from inventory where id = $1",
			[req.params.id]
		);
		const enriched = await attachPhotoUrls(results.rows);
		res.status(200).json({
			status: "success",
			results: enriched.length,
			data: { inventory: enriched },
		});
	} catch (err) {
		console.error("inventory.detail error:", err);
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

		// release_number_id comes from the picker; sale_company_id is inherited
		// from the release since every container's sale_company should match its
		// release. The legacy acceptance_number / sale_company text columns
		// (still in the request body for backwards compat) are now ignored —
		// PR 1.6 dropped them once every container had a proper FK.
		// photos: optional list of S3 keys captured during intake; first key is
		// the OCR target by convention. Defaults to NULL when the client skips
		// the photo step (legacy /add callers always do).
		const photos = Array.isArray(container.photos) && container.photos.length
			? container.photos
			: null;
		await db.query(
			`INSERT INTO inventory (
				date, unit_number, size, damage, trucking_company,
				state, notes, acquisition_price,
				release_number_id, sale_company_id, is_pending_audit, photos
			) VALUES (
				CURRENT_TIMESTAMP, $1, $2, $3, $4,
				$5, $6, $7,
				$8,
				(SELECT sale_company_id FROM release_numbers WHERE release_number_id = $8),
				true, $9
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
				photos,
			]
		);

		// release_number_count is the quota set at release creation and never
		// decremented. When actual intake overshoots the quota (e.g. an 11th
		// box logged against a 10-box release), bump the quota to match so the
		// release summary report can't report a nonsense filled/quota ratio.
		// Counts BOTH kinds: a release can hold mixed sales + S&H boxes
		// (migration 0021), so the bump must reflect both.
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
			[releaseId]
		);

		// PR 2.8 auto-association: if this release has pre-loaded container
		// numbers and one matches the new box's unit_number, mark it used.
		// No-op when the release has no enumeration loaded.
		if (container.unit_number) {
			await db.query(
				`UPDATE release_number_containers
				 SET is_used = true
				 WHERE release_number_id = $1 AND container_number = $2`,
				[releaseId, container.unit_number.trim().toUpperCase()],
			);
		}

		res.status(200).json({ status: "success" });
	} catch (err) {
		console.error("inventory.add error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// Admin audit (PR 2.5). Confirms / overrides acquisition_price + date,
// clears is_pending_audit, transitions pending → available. Returns 404
// if the row has already been audited or doesn't exist (mirrors the S&H
// audit endpoint's behavior so the UI can treat them uniformly).
//
// PR 4.3 follow-up: when the admin corrects unit_number during audit
// (typical case: OCR misread that the admin caught by reading the photo),
// also rename the matching release_number_containers row so the
// enumeration stays linked to the same physical box. The release
// auto-association at intake stored the row using the (now-wrong)
// original unit_number; without this cascade the post-audit container
// would no longer match its enumeration entry. Wrapped in a transaction
// so a PK conflict on the cascade can't leave inventory + enumeration
// diverged.
router.put(
	"/audit/:id",
	checkAdmin,
	validateBody(auditInventorySchema),
	async (req, res) => {
		const client = await db.pool.connect();
		try {
			const b = req.body;
			await client.query("BEGIN");

			const before = await client.query(
				`SELECT unit_number, release_number_id
				 FROM inventory
				 WHERE id = $1 AND is_pending_audit = true`,
				[req.params.id],
			);
			if (before.rows.length === 0) {
				await client.query("ROLLBACK");
				return res
					.status(404)
					.json({ message: "Not found or already audited" });
			}
			const oldUnit = before.rows[0].unit_number;
			const releaseId = before.rows[0].release_number_id;

			// Audit-time safety: if the admin is renaming the unit number AND
			// the rename will mutate release enumeration data (either the old
			// unit was a real enumerated number in this release, or the new
			// unit is enumerated under any release), surface the conflict and
			// require explicit confirmation. Without this gate the cascade
			// silently rewrites the wrong enumeration row when a misread box
			// is being corrected to a different real container.
			const proposedNorm = (b.unit_number ?? "").trim().toUpperCase();
			const oldNormForCheck = (oldUnit ?? "").trim().toUpperCase();
			if (
				proposedNorm &&
				proposedNorm !== oldNormForCheck &&
				!b.confirm_unit_rename
			) {
				const oldLinked = releaseId
					? await client.query(
							`SELECT 1 FROM release_number_containers
							 WHERE release_number_id = $1 AND container_number = $2`,
							[releaseId, oldNormForCheck],
						)
					: { rows: [] };
				const newLinked = await client.query(
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
						? await client.query(
								`SELECT rn.release_number_value, sc.sale_company_name
								 FROM release_numbers rn
								 LEFT JOIN sale_companies sc ON sc.sale_company_id = rn.sale_company_id
								 WHERE rn.release_number_id = $1`,
								[releaseId],
							)
						: { rows: [] };
					await client.query("ROLLBACK");
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

			const result = await client.query(
				`UPDATE inventory SET
					acquisition_price = COALESCE($1, acquisition_price),
					date = COALESCE($2::timestamptz, date),
					notes = COALESCE($3, notes),
					unit_number = COALESCE($4, unit_number),
					size = COALESCE($5, size),
					damage = COALESCE($6, damage),
					trucking_company = COALESCE($7, trucking_company),
					is_pending_audit = false,
					state = CASE WHEN state = 'pending' THEN 'available'::inventory_state ELSE state END
				 WHERE id = $8 AND is_pending_audit = true
				 RETURNING id, state, is_pending_audit, unit_number`,
				[
					b.acquisition_price ?? null,
					b.date ?? null,
					b.notes ?? null,
					b.unit_number ?? null,
					b.size ?? null,
					b.damage ?? null,
					b.trucking_company ?? null,
					req.params.id,
				],
			);
			if (result.rows.length === 0) {
				await client.query("ROLLBACK");
				return res
					.status(404)
					.json({ message: "Not found or already audited" });
			}

			// Cascade unit_number change to the enumeration row if any.
			// Match by trim+upper because that's how intake stores the
			// container_number on auto-association.
			const oldNorm = (oldUnit ?? "").trim().toUpperCase();
			const newNorm = (result.rows[0].unit_number ?? "").trim().toUpperCase();
			if (oldNorm !== newNorm && releaseId) {
				await client.query(
					`UPDATE release_number_containers
					 SET container_number = $1
					 WHERE release_number_id = $2 AND container_number = $3`,
					[newNorm, releaseId, oldNorm],
				);
			}

			await client.query("COMMIT");
			res.status(200).json({
				status: "success",
				data: { box: result.rows[0] },
			});
		} catch (err) {
			await client.query("ROLLBACK").catch(() => {});
			console.error("inventory.audit error:", err);
			res.status(500).json({ message: "Internal server error" });
		} finally {
			client.release();
		}
	},
);

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
	const client = await db.pool.connect();
	try {
		await client.query("BEGIN");

		const found = await client.query(
			`SELECT id, state, unit_number, release_number_id
			 FROM inventory WHERE id = $1 FOR UPDATE`,
			[req.params.id],
		);
		if (found.rows.length === 0) {
			await client.query("ROLLBACK");
			return res.status(404).json({ message: "Container not found" });
		}
		const box = found.rows[0];

		// Only available boxes are deletable. sold/outbound/hold carry sale +
		// invoice history; their FKs are ON DELETE CASCADE, so deleting them
		// would silently take out invoice line items and sale records.
		if (box.state !== "available") {
			await client.query("ROLLBACK");
			return res.status(409).json({
				status: "conflict",
				code: "not_deletable_state",
				message: `Only available containers can be deleted (this one is '${box.state}').`,
			});
		}

		// Defensive: an available box shouldn't be on an invoice or have a sold
		// row, but if state ever drifted, refuse rather than cascade history away.
		const refs = await client.query(
			`SELECT
			   (SELECT count(*) FROM invoice_containers WHERE container_id = $1) AS invoice_refs,
			   (SELECT count(*) FROM sold WHERE inventory_id = $1) AS sold_refs`,
			[req.params.id],
		);
		if (
			Number(refs.rows[0].invoice_refs) > 0 ||
			Number(refs.rows[0].sold_refs) > 0
		) {
			await client.query("ROLLBACK");
			return res.status(409).json({
				status: "conflict",
				code: "has_sale_history",
				message:
					"Container has invoice or sale history and cannot be deleted; remove it from its invoice first.",
			});
		}

		await client.query("DELETE FROM inventory WHERE id = $1", [req.params.id]);

		// Reopen the release enumeration slot so the unit number can be
		// re-entered (intake auto-marks it used on creation, matching by
		// trim+upper). No-op when the unit wasn't pre-enumerated.
		let slotReopened = 0;
		if (box.release_number_id && box.unit_number) {
			const reopened = await client.query(
				`UPDATE release_number_containers
				 SET is_used = false
				 WHERE release_number_id = $1 AND container_number = $2`,
				[box.release_number_id, box.unit_number.trim().toUpperCase()],
			);
			slotReopened = reopened.rowCount ?? 0;
		}

		await client.query("COMMIT");
		res.status(200).json({
			status: "success",
			data: {
				deleted_id: Number(req.params.id),
				release_slot_reopened: slotReopened,
			},
		});
	} catch (err) {
		await client.query("ROLLBACK").catch(() => {});
		console.error("inventory.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	} finally {
		client.release();
	}
});

export default router;
