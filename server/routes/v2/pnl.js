// Live P&L read endpoint for the dashboard panel.
//
// Wraps resolvePnL() with a thin GET surface so the operator can scrub
// the dashboard's granularity / period toggle without persisting a row
// for every view. The "Generate PDF" button on the panel still POSTs
// to /api/v2/report (which snapshots resolved_data into the row) so
// historical reports stay frozen.

import express from "express";
import { checkEmployee } from "../../middleware/auth.js";
import {
	resolvePnL,
	resolvePeriod,
	previousPeriod,
} from "../../lib/report-resolvers/pnl.js";
import {
	resolveTopClients,
	resolveYardSnapshot,
	resolvePnlBreakdown,
} from "../../lib/report-resolvers/dashboard-extras.js";

const router = express.Router();

const ALLOWED_GRANULARITY = new Set(["month", "quarter", "year"]);
const MAX_TIMESERIES_PERIODS = 36;
const MAX_TOP_CLIENTS = 25;

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

// GET /api/v2/pnl/timeseries?granularity=month&period=2026-05&periods=12
// Returns the N periods ending at `period` (inclusive) with full
// resolved P&L data per period. Dashboard renders this as a trend chart.
router.get("/timeseries", checkEmployee, async (req, res) => {
	const granularity = String(req.query.granularity ?? "");
	const period = String(req.query.period ?? "");
	const periodsRaw = parseInt(String(req.query.periods ?? "12"), 10);
	if (!ALLOWED_GRANULARITY.has(granularity)) {
		return res.status(400).json({
			message: "granularity must be one of: month, quarter, year",
		});
	}
	if (!period) {
		return res.status(400).json({ message: "period is required" });
	}
	const periods = Math.min(
		Math.max(Number.isInteger(periodsRaw) ? periodsRaw : 12, 1),
		MAX_TIMESERIES_PERIODS,
	);
	try {
		const periodKeys = [];
		for (let i = periods - 1; i >= 0; i -= 1) {
			periodKeys.push(previousPeriod(granularity, period, i));
		}
		const series = await Promise.all(
			periodKeys.map((p) => resolvePnL({ granularity, period: p }, 0)),
		);
		res.status(200).json({
			status: "success",
			data: { granularity, periods: series },
		});
	} catch (err) {
		console.error("pnl.timeseries error:", err);
		res.status(400).json({
			message: err instanceof Error ? err.message : "Invalid request",
		});
	}
});

// GET /api/v2/pnl/top-clients?granularity=month&period=2026-05&limit=10
router.get("/top-clients", checkEmployee, async (req, res) => {
	const granularity = String(req.query.granularity ?? "");
	const period = String(req.query.period ?? "");
	const limitRaw = parseInt(String(req.query.limit ?? "10"), 10);
	if (!ALLOWED_GRANULARITY.has(granularity)) {
		return res
			.status(400)
			.json({ message: "granularity must be one of: month, quarter, year" });
	}
	if (!period) {
		return res.status(400).json({ message: "period is required" });
	}
	try {
		resolvePeriod(granularity, period);
	} catch (err) {
		return res.status(400).json({
			message: err instanceof Error ? err.message : "Invalid period",
		});
	}
	const limit = Math.min(
		Math.max(Number.isInteger(limitRaw) ? limitRaw : 10, 1),
		MAX_TOP_CLIENTS,
	);
	try {
		const rows = await resolveTopClients(
			{ granularity, period },
			limit,
		);
		res.status(200).json({ status: "success", data: { clients: rows } });
	} catch (err) {
		console.error("pnl.top-clients error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// GET /api/v2/pnl/breakdown?granularity=...&period=...
// Per-container rows that feed every Sales-side aggregate on the panel
// (revenue, cost, mod revenue/cost, trucking, sale_price). Used by the
// "view per-container detail" modal.
router.get("/breakdown", checkEmployee, async (req, res) => {
	const granularity = String(req.query.granularity ?? "");
	const period = String(req.query.period ?? "");
	if (!ALLOWED_GRANULARITY.has(granularity)) {
		return res
			.status(400)
			.json({ message: "granularity must be one of: month, quarter, year" });
	}
	if (!period) {
		return res.status(400).json({ message: "period is required" });
	}
	try {
		resolvePeriod(granularity, period);
	} catch (err) {
		return res.status(400).json({
			message: err instanceof Error ? err.message : "Invalid period",
		});
	}
	try {
		const rows = await resolvePnlBreakdown({ granularity, period });
		res.status(200).json({ status: "success", data: { rows } });
	} catch (err) {
		console.error("pnl.breakdown error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

// GET /api/v2/pnl/yard — yard snapshot counts (state, size, audit, damage).
router.get("/yard", checkEmployee, async (_req, res) => {
	try {
		const data = await resolveYardSnapshot();
		res.status(200).json({ status: "success", data });
	} catch (err) {
		console.error("pnl.yard error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
