import React, { useState, useEffect, createContext } from "react";

export const userContext = createContext();

export const Provider = (props) => {
	const [user, setUser] = useState({});
	const [popup, setPopup] = useState("");
	const [theme, setTheme] = useState(
		() => localStorage.getItem("theme") || "light"
	);

	useEffect(() => {
		// Paths reachable without auth (the auth page itself plus any
		// public compliance pages). Bail out of the session probe so we
		// don't bounce unauthenticated visitors back to /auth.
		const publicPaths = ["/sms-terms", "/privacy-policy"];
		const pathname = window.location.pathname;
		const isPublic =
			pathname.includes("auth") || publicPaths.includes(pathname);
		if (isPublic) return;

		fetch("/api/auth/get-session", { credentials: "include" })
			.then((res) => {
				if (res.status === 401) {
					window.location.href = "/auth";
					return null;
				}
				// Non-401 server errors are transient (proxy hiccup, 5xx) —
				// not proof the session is gone, so don't log the user out.
				if (!res.ok) return null;
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				if (!data.user) {
					window.location.href = "/auth";
					return;
				}
				setUser({
					email: data.user.email,
					permissions: data.user.role,
				});
			})
			.catch(() => {
				// Network blip or bad JSON — keep whatever session state we
				// already have rather than bouncing to /auth.
			});
	}, []);

	const toggleTheme = () => {
		const next = theme === "light" ? "dark" : "light";
		setTheme(next);
		document.documentElement.setAttribute("data-theme", next);
		localStorage.setItem("theme", next);
	};

	let value = { user, setUser, popup, setPopup, theme, toggleTheme };
	return (
		<userContext.Provider value={value}>
			{props.children}
		</userContext.Provider>
	);
};
