// Admin-editable modification description presets (Phase 5 PR 5.1).
// Backs the invoice editor's <datalist> and replaces the hard-coded
// array that lived in client/src/components/forms/modificationPresets.ts.

import express from "express";
import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { mod_presets } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	modPresetSchema,
	modPresetUpdateSchema,
} from "../../validation/mod_presets.js";

const router = express.Router();

// GET /api/v2/mod-presets — ordered list. checkEmployee since the
// invoice create flow + editor both consume it.
router.get("/", checkEmployee, async (_req, res) => {
	try {
		const rows = await drizzleDb
			.select()
			.from(mod_presets)
			.orderBy(asc(mod_presets.position), asc(mod_presets.id));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { presets: rows },
		});
	} catch (err) {
		console.error("mod_presets.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(modPresetSchema),
	async (req, res) => {
		try {
			const inserted = await drizzleDb
				.insert(mod_presets)
				.values({ label: req.body.label, position: req.body.position ?? 0 })
				.returning();
			res
				.status(201)
				.json({ status: "success", data: { preset: inserted[0] } });
		} catch (err) {
			// PK + unique label violations surface as 23505.
			if (err && err.code === "23505") {
				return res.status(409).json({
					status: "conflict",
					message: "A preset with that label already exists.",
				});
			}
			console.error("mod_presets.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.put(
	"/:id",
	checkAdmin,
	validateBody(modPresetUpdateSchema),
	async (req, res) => {
		try {
			const id = Number(req.params.id);
			if (!Number.isInteger(id)) {
				return res.status(400).json({ message: "Invalid id" });
			}
			const patch = {};
			if (req.body.label !== undefined) patch.label = req.body.label;
			if (req.body.position !== undefined) patch.position = req.body.position;
			if (Object.keys(patch).length === 0) {
				return res.status(400).json({ message: "No editable fields supplied" });
			}
			const updated = await drizzleDb
				.update(mod_presets)
				.set(patch)
				.where(eq(mod_presets.id, id))
				.returning();
			if (updated.length === 0) {
				return res.status(404).json({ message: "Preset not found" });
			}
			res.status(200).json({ status: "success", data: { preset: updated[0] } });
		} catch (err) {
			if (err && err.code === "23505") {
				return res.status(409).json({
					status: "conflict",
					message: "A preset with that label already exists.",
				});
			}
			console.error("mod_presets.update error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		const id = Number(req.params.id);
		if (!Number.isInteger(id)) {
			return res.status(400).json({ message: "Invalid id" });
		}
		const deleted = await drizzleDb
			.delete(mod_presets)
			.where(eq(mod_presets.id, id))
			.returning({ id: mod_presets.id });
		if (deleted.length === 0) {
			return res.status(404).json({ message: "Preset not found" });
		}
		res.status(200).json({ status: "success", data: { id: deleted[0].id } });
	} catch (err) {
		console.error("mod_presets.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
