// Admin-editable container-damage presets (Phase 9 PR 9.1). Same shape
// as size_presets / mod_presets.

import express from "express";
import { asc, eq } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { damage_presets } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	damagePresetSchema,
	damagePresetUpdateSchema,
} from "../../validation/damage_presets.js";

const router = express.Router();

router.get("/", checkEmployee, async (_req, res) => {
	try {
		const rows = await drizzleDb
			.select()
			.from(damage_presets)
			.orderBy(asc(damage_presets.position), asc(damage_presets.id));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { presets: rows },
		});
	} catch (err) {
		console.error("damage_presets.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(damagePresetSchema),
	async (req, res) => {
		try {
			const inserted = await drizzleDb
				.insert(damage_presets)
				.values({ label: req.body.label, position: req.body.position ?? 0 })
				.returning();
			res
				.status(201)
				.json({ status: "success", data: { preset: inserted[0] } });
		} catch (err) {
			if (err && (err.code === "23505" || err.cause?.code === "23505")) {
				return res.status(409).json({
					status: "conflict",
					message: "A preset with that label already exists.",
				});
			}
			console.error("damage_presets.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.put(
	"/:id",
	checkAdmin,
	validateBody(damagePresetUpdateSchema),
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
				.update(damage_presets)
				.set(patch)
				.where(eq(damage_presets.id, id))
				.returning();
			if (updated.length === 0) {
				return res.status(404).json({ message: "Preset not found" });
			}
			res.status(200).json({ status: "success", data: { preset: updated[0] } });
		} catch (err) {
			if (err && (err.code === "23505" || err.cause?.code === "23505")) {
				return res.status(409).json({
					status: "conflict",
					message: "A preset with that label already exists.",
				});
			}
			console.error("damage_presets.update error:", err);
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
			.delete(damage_presets)
			.where(eq(damage_presets.id, id))
			.returning({ id: damage_presets.id });
		if (deleted.length === 0) {
			return res.status(404).json({ message: "Preset not found" });
		}
		res.status(200).json({ status: "success", data: { id: deleted[0].id } });
	} catch (err) {
		console.error("damage_presets.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
