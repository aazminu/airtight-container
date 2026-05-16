// Admin-editable container-size presets (Phase 9 PR 9.1). Backs the
// intake + InventoryEditor <datalist>. Same shape as mod_presets.

import express from "express";
import { asc, eq } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { size_presets } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import {
	sizePresetSchema,
	sizePresetUpdateSchema,
} from "../../validation/size_presets.js";

const router = express.Router();

router.get("/", checkEmployee, async (_req, res) => {
	try {
		const rows = await drizzleDb
			.select()
			.from(size_presets)
			.orderBy(asc(size_presets.position), asc(size_presets.id));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { presets: rows },
		});
	} catch (err) {
		console.error("size_presets.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(sizePresetSchema),
	async (req, res) => {
		try {
			const inserted = await drizzleDb
				.insert(size_presets)
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
			console.error("size_presets.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

router.put(
	"/:id",
	checkAdmin,
	validateBody(sizePresetUpdateSchema),
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
				.update(size_presets)
				.set(patch)
				.where(eq(size_presets.id, id))
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
			console.error("size_presets.update error:", err);
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
			.delete(size_presets)
			.where(eq(size_presets.id, id))
			.returning({ id: size_presets.id });
		if (deleted.length === 0) {
			return res.status(404).json({ message: "Preset not found" });
		}
		res.status(200).json({ status: "success", data: { id: deleted[0].id } });
	} catch (err) {
		console.error("size_presets.delete error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
