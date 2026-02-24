import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.js";

export const checkAuth = async (req, res, next) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});
	if (!session) return res.status(401).json({ message: "Unauthorized" });
	req.user = session.user;
	next();
};

export const checkAdmin = async (req, res, next) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});
	if (!session || session.user.role !== "admin")
		return res.status(401).json({ message: "Admin access required" });
	req.user = session.user;
	next();
};

export const checkEmployee = async (req, res, next) => {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	});
	if (!session || session.user.role === "pending")
		return res.status(401).json({ message: "Unauthorized" });
	req.user = session.user;
	next();
};
