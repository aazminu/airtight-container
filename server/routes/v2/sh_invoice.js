import express from "express";
import db from "../../db/index.js";
import { checkEmployee, checkAdmin } from "../../middleware/auth.js";
import { generateShMonthEnd, priorMonth } from "../../lib/sh-month-end.js";

const router = express.Router();

// GET /api/v2/sh-invoice — list, optionally filtered by ?status=pending_review.
// Returns one row per invoice with its lines + client name.
router.get("/", checkEmployee, async (req, res) => {
	const status = typeof req.query.status === "string" ? req.query.status : null;
	try {
		const { rows: invs } = await db.query(
			`SELECT i.id, i.client_id, i.billing_month, i.invoice_number,
			        i.subtotal, i.tax_rate, i.tax_amount, i.total,
			        i.pdf_s3_key, i.status, i.generated_at, i.sent_at,
			        cl.client_name, cl.business_name, cl.contact_email
			 FROM sh_invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 ${status ? "WHERE i.status = $1" : ""}
			 ORDER BY i.billing_month DESC, i.invoice_number DESC`,
			status ? [status] : [],
		);
		const ids = invs.map((r) => r.id);
		let linesByInv = new Map();
		if (ids.length > 0) {
			const { rows: lines } = await db.query(
				`SELECT id, sh_invoice_id, sh_box_id, line_type, days_count,
				        rate, amount, description
				 FROM sh_invoice_lines
				 WHERE sh_invoice_id = ANY($1::int[])
				 ORDER BY sh_invoice_id, id`,
				[ids],
			);
			for (const l of lines) {
				if (!linesByInv.has(l.sh_invoice_id))
					linesByInv.set(l.sh_invoice_id, []);
				linesByInv.get(l.sh_invoice_id).push(l);
			}
		}
		const enriched = invs.map((r) => ({ ...r, lines: linesByInv.get(r.id) ?? [] }));
		res.status(200).json({
			status: "success",
			results: enriched.length,
			data: { invoices: enriched },
		});
	} catch (err) {
		req.log.error({ err }, "sh_invoice list failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

router.get("/:id", checkEmployee, async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!Number.isFinite(id))
		return res.status(400).json({ message: "Invalid id" });
	try {
		const { rows: invs } = await db.query(
			`SELECT i.*, cl.client_name, cl.business_name, cl.contact_email
			 FROM sh_invoices i
			 JOIN clients cl ON i.client_id = cl.id
			 WHERE i.id = $1`,
			[id],
		);
		if (invs.length === 0)
			return res.status(404).json({ message: "Not found" });
		const { rows: lines } = await db.query(
			`SELECT id, sh_invoice_id, sh_box_id, line_type, days_count,
			        rate, amount, description
			 FROM sh_invoice_lines WHERE sh_invoice_id = $1 ORDER BY id`,
			[id],
		);
		res.status(200).json({
			status: "success",
			data: { invoice: { ...invs[0], lines } },
		});
	} catch (err) {
		req.log.error({ err }, "sh_invoice get failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

// POST /api/v2/sh-invoice/run-month-end — admin manual trigger.
// Body: { year?: number, monthIndex?: number }. Defaults to prior month.
router.post("/run-month-end", checkAdmin, async (req, res) => {
	let { year, monthIndex } = req.body ?? {};
	if (year == null || monthIndex == null) {
		const p = priorMonth();
		year = p.year;
		monthIndex = p.monthIndex;
	} else {
		// Validate a caller-supplied period before it reaches the generator and
		// the date math — reject non-integers / out-of-range values.
		year = Number(year);
		monthIndex = Number(monthIndex);
		if (
			!Number.isInteger(year) ||
			year < 2000 ||
			year > 2100 ||
			!Number.isInteger(monthIndex) ||
			monthIndex < 0 ||
			monthIndex > 11
		) {
			return res
				.status(400)
				.json({ message: "year must be an integer and monthIndex 0–11" });
		}
	}
	try {
		const summary = await generateShMonthEnd(year, monthIndex);
		res.status(200).json({ status: "success", summary });
	} catch (err) {
		req.log.error({ err }, "sh_invoice run-month-end failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/:id/send", checkAdmin, async (req, res) => {
	const id = parseInt(req.params.id, 10);
	if (!Number.isFinite(id))
		return res.status(400).json({ message: "Invalid id" });
	try {
		await db.query(
			"UPDATE sh_invoices SET status = 'sent', sent_at = NOW() WHERE id = $1",
			[id],
		);
		res.status(200).json({ status: "success" });
	} catch (err) {
		req.log.error({ err }, "sh_invoice send failed");
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
