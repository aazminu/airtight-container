import React, { useState, useEffect, createContext } from "react";

export const userContext = createContext();

export const Provider = (props) => {
	const [user, setUser] = useState({});
	const [popup, setPopup] = useState("");
	const [theme, setTheme] = useState(
		() => localStorage.getItem("theme") || "light"
	);

	useEffect(() => {
		fetch("/api/auth/get-session", { credentials: "include" })
			.then((res) => res.json())
			.then((data) => {
				if (!data || !data.user) {
					if (!window.location.pathname.includes("auth")) {
						window.location.href = "/auth";
					}
					return;
				}
				setUser({
					email: data.user.email,
					permissions: data.user.role,
				});
			})
			.catch(() => {
				if (!window.location.pathname.includes("auth")) {
					window.location.href = "/auth";
				}
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
