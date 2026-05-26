import "dotenv/config";
import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import express from "express";
import { toNodeHandler } from "better-auth/node";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";
import { auth } from "./auth.js";
import soldRoute from "./routes/v1/sold.js";
import inventoryRoute from "./routes/v1/inventory.js";
import releaseRoute_2 from "./routes/v2/release.js";
import invoiceRoute from "./routes/v2/invoice.js";
import dashboardRoute from "./routes/v2/dashboard.js";
import clientRoute from "./routes/v2/client.js";
import shInventoryRoute from "./routes/v2/sh_inventory.js";
import shInvoiceRoute from "./routes/v2/sh_invoice.js";
import intakeRoute from "./routes/v2/intake.js";
import reportRoute from "./routes/v2/report.js";
import pnlRoute from "./routes/v2/pnl.js";
import modPresetsRoute from "./routes/v2/mod_presets.js";
import sizePresetsRoute from "./routes/v2/size_presets.js";
import damagePresetsRoute from "./routes/v2/damage_presets.js";
import publicReceiptRoute from "./routes/public/receipt.js";
import { generateShMonthEnd, priorMonth } from "./lib/sh-month-end.js";
import { applyOutboundFromDeliverySheets } from "./lib/outbound-from-delivery.js";

const app = express();
const port = process.env.PORT;
app.set("trust proxy", 1);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// CORS allowlist guard. Fail-fast at boot: every cookie-authenticated
// endpoint is reachable via cross-origin when credentials:true, so a
// wildcard / missing / wrong CORS_ORIGIN would silently open the entire
// API to attacker-origin scripts. Reject anything that isn't a single
// http(s) origin string.
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin || corsOrigin === "*" || corsOrigin.includes(",")) {
	throw new Error(
		`CORS_ORIGIN must be a single http(s) origin (got: ${JSON.stringify(corsOrigin)})`,
	);
}
try {
	new URL(corsOrigin);
} catch {
	throw new Error(`CORS_ORIGIN is not a valid URL: ${corsOrigin}`);
}

app.use(helmet());
app.use(
	cors({
		origin: corsOrigin,
		credentials: true,
	})
);

// Better Auth must be mounted before express.json()
app.all("/api/auth/*", authLimiter, toNodeHandler(auth));

app.use(express.json());

app.use("/api/v1/inventory/sold", soldRoute);
app.use("/api/v1/inventory", inventoryRoute);

app.use("/api/v2/release", releaseRoute_2);
app.use("/api/v2/dashboard", dashboardRoute);
app.use("/api/v2/invoice", invoiceRoute);
app.use("/api/v2/clients", clientRoute);
app.use("/api/v2/sh-inventory", shInventoryRoute);
app.use("/api/v2/sh-invoice", shInvoiceRoute);
app.use("/api/v2/intake", intakeRoute);
app.use("/api/v2/report", reportRoute);
app.use("/api/v2/pnl", pnlRoute);
app.use("/api/v2/mod-presets", modPresetsRoute);
app.use("/api/v2/size-presets", sizePresetsRoute);
app.use("/api/v2/damage-presets", damagePresetsRoute);

// Public-facing receipt-link route. Unauthenticated by design — the
// 128-bit token in the URL is the access credential. Mounted at /r,
// outside the /api/* auth tree.
app.use("/r", publicReceiptRoute);

// PR 3.6: S&H month-end cron. Runs at 01:00 on the 1st of each month,
// billing the previous month. Disabled outside production by default —
// dev/CI environments shouldn't fire it accidentally. Admins can still
// trigger ad-hoc via POST /api/v2/sh-invoice/run-month-end.
if (process.env.SH_MONTH_END_CRON !== "off") {
	cron.schedule("0 1 1 * *", async () => {
		const { year, monthIndex } = priorMonth();
		console.log(`[sh-cron] firing month-end for ${year}-${monthIndex + 1}`);
		try {
			const summary = await generateShMonthEnd(year, monthIndex);
			console.log("[sh-cron] done", summary);
		} catch (err) {
			console.error("[sh-cron] failed", err);
		}
	});
}

// PR 9.7: daily sweep that flips 'sold' containers to 'outbound' once
// their delivery-sheet date is in the past. The eager hook in the
// report-create + regenerate routes catches the common case (operator
// creates the sheet on the day of pickup); this cron covers the rare
// future-dated case where the operator schedules tomorrow's pickup
// today. 05:00 ET = early enough that yard-view shows the right state
// at the start of the work day, late enough that any cross-midnight
// edits have settled.
if (process.env.OUTBOUND_FLIP_CRON !== "off") {
	cron.schedule("0 5 * * *", async () => {
		console.log("[outbound-cron] sweep starting");
		try {
			const result = await applyOutboundFromDeliverySheets();
			if (result.flipped > 0) {
				console.log(
					`[outbound-cron] flipped ${result.flipped} container(s) to outbound:`,
					result.flipped_ids,
				);
			} else {
				console.log("[outbound-cron] no containers due");
			}
		} catch (err) {
			console.error("[outbound-cron] failed", err);
		}
	});
}

app.listen(port, () => {
	console.log(`Server is up and listening on port ${port}`);
});
