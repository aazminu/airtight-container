import "dotenv/config";
import { webcrypto } from "crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { Resend } from "resend";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { auth } from "./auth.js";
import { checkAuth } from "./middleware/auth.js";
import soldRoute from "./routes/v1/sold.js";
import inventoryRoute from "./routes/v1/inventory.js";
import releaseRoute from "./routes/v1/release.js";
import releaseRoute_2 from "./routes/v2/release.js";
import invoiceRoute from "./routes/v2/invoice.js";
import dashboardRoute from "./routes/v2/dashboard.js";
import contactRoute from "./routes/v2/contact.js";

const app = express();
const port = process.env.PORT;

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const emailLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

app.use(
	cors({
		origin: process.env.CORS_ORIGIN,
		credentials: true,
	})
);

// Better Auth must be mounted before express.json()
app.all("/api/auth/*", authLimiter, toNodeHandler(auth));

app.use(express.json());

app.use("/api/v1/release", releaseRoute);
app.use("/api/v1/inventory/sold", soldRoute);
app.use("/api/v1/inventory", inventoryRoute);

app.use("/api/v2/release", releaseRoute_2);
app.use("/api/v2/dashboard", dashboardRoute);
app.use("/api/v2/invoice", invoiceRoute);
app.use("/api/v2/contact", contactRoute);

app.post("/api/v1/send", emailLimiter, checkAuth, async (req, res) => {
	const resend = new Resend(process.env.RESEND);
	const { to, subject, html, bcc } = req.body;
	const { data, error } = await resend.emails.send({
		from: "Michelle <michelle@airtightstorage.com>",
		to: [to],
		bcc: bcc,
		subject: subject,
		html: html,
	});

	if (error) {
		console.log(error);
		return res.status(400).json({ error });
	}
	res.status(200).json({ data });
});

app.listen(port, () => {
	console.log(`Server is up and listening on port ${port}`);
});
