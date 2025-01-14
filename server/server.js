require("dotenv").config();
const { Resend } = require("resend");
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const authRoute = require("./routes/v1/auth");
const soldRoute = require("./routes/v1/sold");
const inventoryRoute = require("./routes/v1/inventory");
const releaseRoute = require("./routes/v1/release");
const releaseRoute_2 = require("./routes/v2/release");
const invoiceRoute = require("./routes/v2/invoice");
const dashboardRoute = require("./routes/v2/dashboard");
const contactRoute = require("./routes/v2/contact");

const db = require("./db");
const cors = require("cors");
const app = express();
const port = process.env.PORT;
const resend = new Resend(process.env.RESEND);

app.use(
	cors({
		origin: "http://localhost:3000",
		credentials: true,
	})
);

app.use(express.json());

app.use(
	session({
		secret: process.env.SESSION_KEY,
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: false,
			maxAge: 24 * 60 * 60 * 1000,
			httpOnly: true,
		}, // Set to true if using HTTPS
	})
);

app.use("/api/v1/auth", authRoute);
app.use("/api/v1/release", releaseRoute);
app.use("/api/v1/inventory/sold", soldRoute);
app.use("/api/v1/inventory", inventoryRoute);

app.use("/api/v2/release", releaseRoute_2);
app.use("/api/v2/dashboard", dashboardRoute);
app.use("/api/v2/invoice", invoiceRoute);
app.use("/api/v2/contact", contactRoute);

app.post("/api/v1/send", async (req, res) => {
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
