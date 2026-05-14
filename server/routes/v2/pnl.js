// Live P&L read endpoint for the dashboard panel.
//
// Wraps resolvePnL() with a thin GET surface so the operator can scrub
// the dashboard's granularity / period toggle without persisting a row
// for every view. The "Generate PDF" button on the panel still POSTs
// to /api/v2/report (which snapshots resolved_data into the row) so
// historical reports stay frozen.

import express from "express";
import { checkEmployee } from "../../middleware/auth.js";
import { resolvePnL, resolvePeriod } from "../../lib/report-resolvers/pnl.js";

const router = express.Router();

const ALLOWED_GRANULARITY = new Set(["month", "quarter", "year"]);

router.get("/", checkEmployee, async (req, res) => {
	const granularity = String(req.query.granularity ?? "");
	const period = String(req.query.period ?? "");
	if (!ALLOWED_GRANULARITY.has(granularity)) {
		return res.status(400).json({
			message: "granularity must be one of: month, quarter, year",
		});
	}
	if (!period) {
		return res.status(400).json({ message: "period is required" });
	}
	// resolvePeriod throws on malformed inputs (e.g. "2026-13", "Q5",
	// non-numeric year). Catch and 400 so the dashboard surfaces it
	// rather than 500ing.
	try {
		resolvePeriod(granularity, period);
	} catch (err) {
		return res.status(400).json({
			message: err instanceof Error ? err.message : "Invalid period",
		});
	}
	try {
		const data = await resolvePnL({ granularity, period }, 0);
		res.status(200).json({ status: "success", data });
	} catch (err) {
		console.error("pnl.live error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
