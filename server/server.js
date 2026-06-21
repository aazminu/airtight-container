import "dotenv/config";
import { webcrypto, randomUUID } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import express from "express";
import { toNodeHandler } from "better-auth/node";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import cors from "cors";
import helmet from "helmet";
import cron from "node-cron";
import { auth } from "./auth.js";
import { logger } from "./lib/logger.js";
import { errorBoundary } from "./middleware/errorBoundary.js";
import soldRoute from "./routes/v1/sold.js";
import inventoryRoute from "./routes/v1/inventory.js";
import releaseRoute_2 from "./routes/v2/release.js";
import pickupRoute from "./routes/v2/pickup.js";
import invoiceRoute from "./routes/v2/invoice.js";
import quoteRoute from "./routes/v2/quote.js";
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
import truckingCompaniesRoute from "./routes/v2/trucking_companies.js";
import soldV2Route from "./routes/v2/sold.js";
import publicReceiptRoute from "./routes/public/receipt.js";
import { generateShMonthEnd, priorMonth } from "./lib/sh-month-end.js";
import { applyOutboundFromDeliverySheets } from "./lib/outbound-from-delivery.js";

const app = express();
const port = process.env.PORT;
app.set("trust proxy", 1);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// Stricter bucket for account-creation + password-reset — the enumeration
// and spam-registration surfaces. These previously bypassed rate limiting
// entirely: only sign-in/* was limited, and the /api/auth/* catch-all below
// carries no limit, so sign-up and forget-password could be hammered at full
// network speed.
const signupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

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

// Structured request logging. Mounted before the auth tree so every
// request — auth included — gets a correlation id (echoed back as the
// x-request-id response header and available as req.log inside handlers).
app.use(
	pinoHttp({
		logger,
		genReqId: (req, res) => {
			const existing = req.headers["x-request-id"];
			const id =
				typeof existing === "string" && existing ? existing : randomUUID();
			res.setHeader("x-request-id", id);
			return id;
		},
		customLogLevel: (req, res, err) => {
			if (err || res.statusCode >= 500) return "error";
			if (res.statusCode >= 400) return "warn";
			return "info";
		},
		// get-session is polled on every page load; logging each one floods
		// the stream with no signal. Everything else is logged.
		autoLogging: {
			ignore: (req) => (req.url ?? "").startsWith("/api/auth/get-session"),
		},
	}),
);

// Better Auth must be mounted before express.json().
// Rate-limit only sign-in endpoints — the broader /api/auth/* tree
// includes get-session, which the client hits on every page load,
// so a blanket limiter locks legitimate users out within a few minutes.
// Impersonation has no legitimate use in this single-operator system and is
// a lateral-movement path if an admin session is ever stolen. Block the
// admin plugin's impersonate-user endpoint outright — setting
// impersonationSessionDuration:0 does NOT disable it (0 is falsy, so Better
// Auth falls back to its 1-hour default).
app.all("/api/auth/admin/impersonate-user", (_req, res) =>
	res.status(404).json({ message: "Not found" }),
);
app.all("/api/auth/sign-in/*", authLimiter, toNodeHandler(auth));
app.all(
	[
		"/api/auth/sign-up/*",
		"/api/auth/forget-password",
		"/api/auth/request-password-reset",
		"/api/auth/reset-password",
	],
	signupLimiter,
	toNodeHandler(auth),
);
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.use("/api/v1/inventory/sold", soldRoute);
app.use("/api/v1/inventory", inventoryRoute);

app.use("/api/v2/release", releaseRoute_2);
app.use("/api/v2/pickup", pickupRoute);
app.use("/api/v2/dashboard", dashboardRoute);
app.use("/api/v2/invoice", invoiceRoute);
app.use("/api/v2/quote", quoteRoute);
app.use("/api/v2/clients", clientRoute);
app.use("/api/v2/sh-inventory", shInventoryRoute);
app.use("/api/v2/sh-invoice", shInvoiceRoute);
app.use("/api/v2/intake", intakeRoute);
app.use("/api/v2/report", reportRoute);
app.use("/api/v2/pnl", pnlRoute);
app.use("/api/v2/mod-presets", modPresetsRoute);
app.use("/api/v2/size-presets", sizePresetsRoute);
app.use("/api/v2/damage-presets", damagePresetsRoute);
app.use("/api/v2/trucking-companies", truckingCompaniesRoute);
app.use("/api/v2/sold", soldV2Route);

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
		logger.info({ year, month: monthIndex + 1 }, "[sh-cron] firing month-end");
		try {
			const summary = await generateShMonthEnd(year, monthIndex);
			logger.info({ summary }, "[sh-cron] done");
		} catch (err) {
			logger.error({ err }, "[sh-cron] failed");
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
		logger.info("[outbound-cron] sweep starting");
		try {
			const result = await applyOutboundFromDeliverySheets();
			if (result.flipped > 0) {
				logger.info(
					{ flipped: result.flipped, ids: result.flipped_ids },
					"[outbound-cron] flipped containers to outbound",
				);
			} else {
				logger.info("[outbound-cron] no containers due");
			}
		} catch (err) {
			logger.error({ err }, "[outbound-cron] failed");
		}
	});
}

// Terminal error handler — must come after all routes so anything that
// throws past a handler lands here instead of leaking a stack/500 HTML.
app.use(errorBoundary);

app.listen(port, () => {
	logger.info({ port }, "server listening");
});
