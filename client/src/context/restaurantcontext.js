import React, { useState, useEffect, createContext } from "react";

export const userContext = createContext();

export const Provider = (props) => {
	const [user, setUser] = useState({});
	const [popup, setPopup] = useState("");

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

	let value = { user, setUser, popup, setPopup };
	return (
		<userContext.Provider value={value}>
			{props.children}
		</userContext.Provider>
	);
};
