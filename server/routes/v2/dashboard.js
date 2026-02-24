import express from "express";
import db from "../../db/index.js";
import { checkAdmin } from "../../middleware/auth.js";

const router = express.Router();

// Map Better Auth role to frontend permissions label and vice versa.
// Frontend uses "none"; Better Auth uses "pending" for unpromoted users.
const roleToPermissions = (role) => (role === "pending" ? "none" : role);
const permissionsToRole = (perm) => (perm === "none" ? "pending" : perm);

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
		const role = permissionsToRole(req.body.new_permissions);
		await db.query('UPDATE "user" SET role = $1 WHERE id = $2', [
			role,
			req.params.id,
		]);
		res.status(200).json({ status: "success" });
	} catch (err) {
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
