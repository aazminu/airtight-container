import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

// Terminal error handler — mounted last, after all routes. Logs the full
// error server-side (with the pino-http request id when present) and returns
// a generic message so pg/Drizzle/Resend/Twilio internals never leak to the
// client. Must keep all four args so Express recognises it as error
// middleware.
export const errorBoundary = (
	err: unknown,
	req: Request,
	res: Response,
	next: NextFunction,
): void => {
	const log = (req as Request & { log?: typeof logger }).log ?? logger;
	log.error({ err }, "unhandled error");
	if (res.headersSent) {
		next(err);
		return;
	}
	res.status(500).json({ message: "Internal server error" });
};

export default errorBoundary;
