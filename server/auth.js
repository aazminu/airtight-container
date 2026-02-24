import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import pool from "./db/pool.js";

export const auth = betterAuth({
	database: pool,
	emailAndPassword: { enabled: true },
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		},
	},
	plugins: [
		admin({
			defaultRole: "pending",
			adminRoles: ["admin"],
		}),
	],
	trustedOrigins: [process.env.CORS_ORIGIN],
});
