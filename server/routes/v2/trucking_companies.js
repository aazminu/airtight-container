// Trucking companies (carriers) as entities — migration 0017. Backs the
// outbound-trucker dropdown on the invoice delivery step (with inline
// add) and the delivery sheet.

import express from "express";
import { asc } from "drizzle-orm";
import { db as drizzleDb } from "../../db/drizzle.js";
import { trucking_companies } from "../../db/schema.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { truckingCompanySchema } from "../../validation/trucking_companies.js";

const router = express.Router();

// checkEmployee — the invoice create flow consumes this for the dropdown.
router.get("/", checkEmployee, async (_req, res) => {
	try {
		const rows = await drizzleDb
			.select()
			.from(trucking_companies)
			.orderBy(asc(trucking_companies.company_name));
		res.status(200).json({
			status: "success",
			results: rows.length,
			data: { trucking_companies: rows },
		});
	} catch (err) {
		console.error("trucking_companies.list error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.post(
	"/",
	checkAdmin,
	validateBody(truckingCompanySchema),
	async (req, res) => {
		try {
			const inserted = await drizzleDb
				.insert(trucking_companies)
				.values({
					company_name: req.body.company_name,
					dispatch_name: req.body.dispatch_name ?? null,
					dispatch_phone: req.body.dispatch_phone ?? null,
					dispatch_email: req.body.dispatch_email ?? null,
				})
				.returning();
			res
				.status(201)
				.json({ status: "success", data: { trucking_company: inserted[0] } });
		} catch (err) {
			if (err && (err.code === "23505" || err.cause?.code === "23505")) {
				return res.status(409).json({
					status: "conflict",
					message: "A trucking company with that name already exists.",
				});
			}
			console.error("trucking_companies.create error:", err);
			res.status(500).json({ message: "Internal server error" });
		}
	},
);

export default router;
