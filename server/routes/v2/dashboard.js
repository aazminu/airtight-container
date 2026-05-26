import express from "express";
import db from "../../db/index.js";
import { checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

// Map Better Auth role to frontend permissions label and vice versa.
// Frontend uses "none"; Better Auth uses "pending" for unpromoted users.
const roleToPermissions = (role) => (role === "pending" ? "none" : role);
const permissionsToRole = (perm) => (perm === "none" ? "pending" : perm);

// Allowlist of role transitions an admin can apply. Without this guard
// any string in req.body.new_permissions ends up in user.role — the
// route used to write whatever was POSTed straight to the DB column,
// which Better Auth's session/role gating then trusts. An attacker
// admin could promote any user to any string ('superadmin', etc.) and
// downstream role checks would silently fail-open against the unknown
// label, or — worse — succeed against future role names we add later.
const ALLOWED_PERMISSIONS = new Set(["none", "employee", "admin"]);

router.get("/", checkAdmin, async (req, res) => {
	try {
		const results = await db.query(
			'SELECT id, email, role FROM "user" ORDER BY role'
		);
		const accounts = results.rows.map((u) => ({
			id: u.id,
			email: u.email,
			permissions: roleToPermissions(u.role),
		}));
		res.status(200).json({
			status: "success",
			results: accounts.length,
			accounts,
		});
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

router.put("/:id", checkAdmin, async (req, res) => {
	try {
		const next = req.body?.new_permissions;
		if (!ALLOWED_PERMISSIONS.has(next)) {
			return res.status(400).json({
				message: `new_permissions must be one of: ${[...ALLOWED_PERMISSIONS].join(", ")}`,
			});
		}
		// Block self-demotion of the last admin — would leave the
		// account roster without anyone who can promote new admins.
		if (req.user?.id === req.params.id && next !== "admin") {
			const { rows } = await db.query(
				`SELECT COUNT(*)::int AS n FROM "user" WHERE role = 'admin'`,
			);
			if ((rows[0]?.n ?? 0) <= 1) {
				return res.status(409).json({
					message:
						"Cannot demote the last remaining admin. Promote another user first.",
				});
			}
		}
		const role = permissionsToRole(next);
		await db.query('UPDATE "user" SET role = $1 WHERE id = $2', [
			role,
			req.params.id,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		console.error("dashboard.put error:", err);
		res.status(500).json({ message: "Internal server error" });
	}
});

router.delete("/:id", checkAdmin, async (req, res) => {
	try {
		await db.query('DELETE FROM "user" WHERE id = $1', [req.params.id]);
		res.status(200).json({ status: "success" });
	} catch (err) {
		res.status(500).json({ message: "Internal server error" });
	}
});

export default router;
