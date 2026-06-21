// Public unauthenticated receipt-link route.
//
// Mounted at /r outside the /api/* auth tree. Anyone with a valid
// 128-bit token in the URL can fetch the linked delivery sheet PDF;
// the token IS the access credential — same security model as Slack
// share links, S3 presigned URLs, password-reset emails.
//
// Tokens are issued by POST /api/v2/report/:id/sms (and the
// upcoming "Send to driver" email path). Each send produces a new
// token; old tokens stay valid until 30-day expiry or manual revoke
// from the ReportDetail UI.
//
// Defense-in-depth: even with a valid token, the route refuses to
// resolve anything that isn't a delivery_sheet report (so a leaked
// or buggy token can't surface a P&L or other internal report) and
// honors deleted / revoked / expired states.

import express from "express";
import db from "../../db/index.js";
import { presignedGet } from "../../lib/s3.js";

const router = express.Router();

router.get("/:token", async (req, res) => {
	try {
		const { rows } = await db.query(
			`SELECT l.expires_at, l.revoked_at, l.accessed_at,
			        r.pdf_s3_key, r.report_type
			   FROM report_receipt_links l
			   JOIN reports r ON r.id = l.report_id
			  WHERE l.token = $1`,
			[req.params.token],
		);
		const row = rows[0];
		// Uniform response for every "no usable link" case (missing, wrong
		// report type, revoked, expired) so an unauthenticated caller can't use
		// the status code / message to tell a real-but-revoked token from a
		// nonexistent one. 128-bit tokens already make brute force infeasible;
		// this just closes the existence oracle.
		const unavailable = () =>
			res
				.status(404)
				.send(
					"This receipt link is not available. It may have expired or been revoked — contact the operator for a new one.",
				);
		if (!row) return unavailable();
		if (row.report_type !== "delivery_sheet") return unavailable();
		if (row.revoked_at) return unavailable();
		if (new Date(row.expires_at) < new Date()) return unavailable();
		if (!row.pdf_s3_key) {
			// Distinct on purpose: the token IS valid, the PDF just hasn't
			// finished rendering. Telling the legitimate holder to retry is
			// worth more than hiding this transient state.
			return res
				.status(409)
				.send("Receipt is still being generated. Refresh in a moment.");
		}

		// First-access stamp (one-shot — subsequent opens don't update).
		if (!row.accessed_at) {
			await db.query(
				"UPDATE report_receipt_links SET accessed_at = NOW() WHERE token = $1",
				[req.params.token],
			);
		}

		// Short TTL is fine — the browser follows the redirect
		// immediately, and we'd rather not leak long-lived S3 URLs even
		// if the receipt token itself has 30-day validity.
		const presigned = await presignedGet(row.pdf_s3_key, 60);
		return res.redirect(302, presigned);
	} catch (err) {
		req.log.error({ err }, "public receipt link failed");
		return res.status(500).send("Internal server error.");
	}
});

export default router;
