import React, { useState, useEffect, createContext } from "react";

export const userContext = createContext();

export const Provider = (props) => {
	const [user, setUser] = useState({});
	const [popup, setPopup] = useState("");
	useEffect(() => {
		fetch("/api/v1/auth", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					if (!window.location.pathname.includes("auth")) {
						window.location.href = "/auth";
					}
				}
				return res.json();
			})
			.then((data) => {
				console.log(data, "PERMS");
				setUser(data.user);
			});
	}, []);
	let value = { user, setUser, popup, setPopup };
	console.log(value);
	return (
		<userContext.Provider value={value}>
			{props.children}
		</userContext.Provider>
	);
};
