import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";
import pool from "./db/pool.js";

// Fail fast: an unset secret means Better Auth falls back to a generated /
// empty signing key, making session cookies forgeable. Refuse to boot rather
// than come up insecure (mirrors the CORS_ORIGIN guard in server.js).
if (!process.env.BETTER_AUTH_SECRET) {
	throw new Error("BETTER_AUTH_SECRET is required (set it in server/.env)");
}

// Mark cookies secure whenever we're served over https. Derived from
// BETTER_AUTH_URL (not NODE_ENV, which is unset in prod) so the flag is
// correct behind the TLS-terminating nginx in prod AND stays off for local
// http dev — where a secure cookie would silently never be stored and break
// login.
const useSecureCookies = (process.env.BETTER_AUTH_URL ?? "").startsWith(
	"https://",
);

export const auth = betterAuth({
	database: pool,
	emailAndPassword: { enabled: true },
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		},
	},
	// Google sign-up is intentionally open: a new account lands in the
	// "pending" role with zero access until an admin promotes it
	// (server/middleware/auth.js gates every business route). A hard
	// email/domain allowlist is deferred — it carries login-lockout risk for
	// marginal gain over the pending default. Revisit if signup spam appears.
	advanced: {
		useSecureCookies,
		defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
	},
	plugins: [
		admin({
			defaultRole: "pending",
			adminRoles: ["admin"],
		}),
	],
	trustedOrigins: [process.env.CORS_ORIGIN],
});
