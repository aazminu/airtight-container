import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { addContainersSchema } from "../../validation/release.js";

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
			release.release_number_count !== null &&
			release.release_number_value
		) {
			currObj.numbers.push({
				release_id: release.release_number_id,
				release_count: release.release_number_count,
				release_number: release.release_number_value,
				// PR 5.x: real inventory count under this release. Used by
				// the Active/Filled tab math on the client and to surface a
				// {actual}/{quota} label instead of the misleading old
				// "{quota} remaining" label.
				inventory_count: Number(release.inventory_count ?? 0),
			});
		}
	}
	return finalObj;
};

// All non-archived releases (active + filled). is_complete = true is the
// admin-archive escape hatch (the legacy DELETE button soft-deletes), and
// archived releases stay out of both tabs. Companies still appear even
// when they have no live releases (LEFT JOIN on sale_companies).
router.get("/", checkEmployee, async (req, res) => {
	try {
		// inventory_count sums sales (`inventory`) + S&H (`sh_inventory`)
		// containers attached to the release. Migration 0021 made S&H
		// boxes attach to releases the same way sales do, so the "filled"
		// total has to cover both kinds — otherwise the list page reports
		// 7/10 when 3 of the arrived boxes are S&H.
		const results = await db.query(
			`SELECT sc.sale_company_name, sc.sale_company_id,
			        rn.release_number_id, rn.release_number_count, rn.release_number_value,
			        (
			          (SELECT COUNT(*)::int FROM inventory inv
			           WHERE inv.release_number_id = rn.release_number_id)
			          +
			          (SELECT COUNT(*)::int FROM sh_inventory shi
			           WHERE shi.release_number_id = rn.release_number_id)
			        ) AS inventory_count
			 FROM sale_companies sc
			 LEFT JOIN release_numbers rn
			   ON rn.sale_company_id = sc.sale_company_id AND rn.is_complete = false
			 ORDER BY sc.sale_company_id`
		);
		const releases = groupReleases(results.rows);
		res.status(200).json({
			status: "success",
			results: releases.length,
			data: { releases },
		});
	} catch (err) {
		console.error("release.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// GET /api/v2/release/by-container?number=XXX
// PR 2.8.1: intake calls this after the Confirm step. If the typed /
// OCR'd unit number is pre-loaded under an active release, the picker
// on the Container details step auto-selects + locks to that release.
router.get("/by-container", checkEmployee, async (req, res) => {
	try {
		const number = String(req.query.number ?? "")
			.trim()
			.toUpperCase();
		if (!number) {
			return res.status(400).json({ message: "Missing number" });
		}
		const result = await db.query(
			`SELECT rnc.release_number_id,
			        rn.release_number_value,
			        rn.release_number_count,
			        sc.sale_company_id,
			        sc.sale_company_name
			 FROM release_number_containers rnc
			 JOIN release_numbers rn
			   ON rn.release_number_id = rnc.release_number_id
			 JOIN sale_companies sc
			   ON sc.sale_company_id = rn.sale_company_id
			 WHERE rnc.container_number = $1
			   AND rn.is_complete = false
			 LIMIT 1`,
			[number],
		);
		if (result.rows.length === 0) {
			return res
				.status(200)
				.json({ status: "success", data: { match: null } });
		}
		const row = result.rows[0];
		res.status(200).json({
			status: "success",
			data: {
				match: {
					release_number_id: row.release_number_id,
					release_number_value: row.release_number_value,
					release_number_count: row.release_number_count,
					sale_company_id: row.sale_company_id,
					sale_company_name: row.sale_company_name,
				},
			},
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/numbers", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			"SELECT release_number_id, release_number_count, release_number_value FROM release_numbers WHERE is_complete = false"
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

// Soft-delete: mark complete instead of removing the row. Required because
// inventory.release_number_id will be NOT NULL after PR 1.6 — a real DELETE
// would either fail FK or cascade-destroy historical inventory.
router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query(
			"UPDATE release_numbers SET is_complete = true, completed_at = COALESCE(completed_at, now()) WHERE release_number_id = $1",
			[req.params.id]
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

// ---- release_number_containers (PR 2.8) ---------------------------
// Pre-loaded container numbers per release. Intake auto-associates by
// unit_number on insert (see server/routes/v1/inventory.js POST /add) —
// no client-side change required for the legacy intake form.

// Real inventory rows under this release. Drives the "In yard" section
// on /releases and feeds the release_summary report resolver.
// Includes sold-row joins so the page can show outbound state.
router.get("/:id/inventory", checkEmployee, async (req, res) => {
	try {
		const releaseId = Number(req.params.id);
		if (!Number.isInteger(releaseId)) {
			return res.status(400).json({ message: "Invalid release id" });
		}
		// Returns BOTH sales and S&H containers attached to the release.
		// `kind` lets the client (Releases.tsx) split rendering — sales
		// rows carry buyer/invoice context, S&H rows carry the customer
		// who owns the box. NULL columns on the S&H side are intentional
		// (no buyer, no invoice tie, no destination).
		// Both sides cast `state` to text — `inventory.state` is the
		// `inventory_state` enum and `sh_inventory.state` is `sh_state`,
		// and UNION rejects mismatched column types.
		const results = await db.query(
			`(SELECT 'sales'::text AS kind,
			         inv.id, inv.unit_number, inv.size, inv.damage,
			         inv.state::text AS state, inv.date AS intake_date,
			         s.outbound_date, s.destination,
			         i.invoice_id, i.invoice_number,
			         COALESCE(cl.business_name, cl.client_name) AS buyer_label
			   FROM inventory inv
			   LEFT JOIN sold s ON s.inventory_id = inv.id
			   LEFT JOIN invoice_containers ic ON ic.container_id = inv.id
			   LEFT JOIN invoices i ON i.invoice_id = ic.invoice_id
			   LEFT JOIN clients cl ON cl.id = i.client_id
			   WHERE inv.release_number_id = $1)
			 UNION ALL
			 (SELECT 'sh'::text AS kind,
			         shi.id, shi.unit_number, shi.size, shi.damage,
			         shi.state::text AS state, shi.intake_date,
			         shi.checkout_date AS outbound_date,
			         NULL::text AS destination,
			         NULL::int AS invoice_id, NULL::int AS invoice_number,
			         COALESCE(shc.business_name, shc.client_name) AS buyer_label
			   FROM sh_inventory shi
			   LEFT JOIN clients shc ON shc.id = shi.client_id
			   WHERE shi.release_number_id = $1)
			 ORDER BY intake_date ASC, id ASC`,
			[releaseId],
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { containers: results.rows },
		});
	} catch (err) {
		console.error("release.inventory error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id/containers", checkEmployee, async (req, res) => {
	try {
		const results = await db.query(
			`SELECT container_number, is_used
			 FROM release_number_containers
			 WHERE release_number_id = $1
			 ORDER BY container_number`,
			[req.params.id],
		);
		res.status(200).json({
			status: "success",
			results: results.rows.length,
			data: { containers: results.rows },
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

// Bulk add. Composite PK (release_number_id, container_number) makes
// this idempotent — duplicates are silently ignored.
router.post(
	"/:id/containers",
	checkAdmin,
	validateBody(addContainersSchema),
	async (req, res) => {
		try {
			const releaseId = Number(req.params.id);
			const numbers = req.body.numbers.map((n) => n.toUpperCase());
			// Build a multi-row INSERT in a single round-trip.
			const values = numbers
				.map((_, i) => `($1, $${i + 2})`)
				.join(", ");
			const result = await db.query(
				`INSERT INTO release_number_containers (release_number_id, container_number)
				 VALUES ${values}
				 ON CONFLICT DO NOTHING
				 RETURNING container_number`,
				[releaseId, ...numbers],
			);
			res.status(201).json({
				status: "success",
				data: { added: result.rows.map((r) => r.container_number) },
			});
		} catch (err) {
			console.error("release.containers.post error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.delete("/:id/containers/:number", checkAdmin, async (req, res) => {
	try {
		await db.query(
			`DELETE FROM release_number_containers
			 WHERE release_number_id = $1 AND container_number = $2`,
			[req.params.id, req.params.number.toUpperCase()],
		);
		res.status(200).json({ status: "success" });
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
