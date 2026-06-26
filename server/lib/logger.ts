import pino from "pino";

// Single shared logger. Level is env-tunable (LOG_LEVEL) so prod can run
// at `info` and drop to `debug` for an incident without a redeploy.
//
// Output is raw JSON to stdout (one line per event) — Docker's json-file
// driver captures it, and a UI backend (CloudWatch via the awslogs driver,
// or a SaaS via a pino transport) can be bolted on later with no code
// change here. Pretty-printing is dev-only: NODE_ENV is unset in prod, and
// pino-pretty is a devDependency absent from the prod image, so the pretty
// transport must never be referenced unless we're explicitly in dev.
const pretty = process.env.NODE_ENV === "development";

export const logger = pino({
	level: process.env.LOG_LEVEL ?? "info",
	// Never let secrets or PII reach the logs. Covers auth headers, cookies,
	// and any password/token/secret field nested one level under a request,
	// response, error, or body object.
	redact: {
		paths: [
			"req.headers.authorization",
			"req.headers.cookie",
			'res.headers["set-cookie"]',
			"*.password",
			"*.token",
			"token",
			"*.secret",
			"*.apiKey",
		],
		censor: "[redacted]",
	},
	...(pretty
		? {
				transport: {
					target: "pino-pretty",
					options: {
						colorize: true,
						translateTime: "SYS:HH:MM:ss",
						ignore: "pid,hostname",
					},
				},
		  }
		: {}),
});

export default logger;
