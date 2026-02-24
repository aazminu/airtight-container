import React, { useState, useContext } from "react";
import "../styles/auth.css";
import { userContext } from "../context/restaurantcontext";

function Auth() {
	const { setPopup } = useContext(userContext);
	const [authType, setAuthType] = useState("Login");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errorMsg, setErrorMsg] = useState("");

	const changeAuthType = () => {
		setAuthType((t) => (t === "Login" ? "Register" : "Login"));
	};

	const authUser = async (e) => {
		e.preventDefault();
		setErrorMsg("");

		if (authType === "Login") {
			const res = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email, password }),
			});
			const data = await res.json();
			if (!res.ok) {
				setErrorMsg(data?.message || "Login failed, please try again.");
				return;
			}
			const role = data?.user?.role;
			window.location.href = role === "employee" ? "/yardview" : "/";
		} else {
			const res = await fetch("/api/auth/sign-up/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email, password, name: email }),
			});
			const data = await res.json();
			if (!res.ok) {
				setErrorMsg(
					data?.message ||
						"There was an error creating your account, try again."
				);
				return;
			}
			setPopup("Account successfully created, please sign in.");
			setAuthType("Login");
		}
	};

	const signInWithGoogle = async () => {
		try {
			const res = await fetch("/api/auth/sign-in/social", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ provider: "google", callbackURL: window.location.origin + "/" }),
			});
			const text = await res.text();
			const data = text ? JSON.parse(text) : null;
			if (data?.url) {
				window.location.href = data.url;
			} else {
				setErrorMsg("Google sign-in is not available.");
			}
		} catch {
			setErrorMsg("Google sign-in failed, please try again.");
		}
	};

	return (
		<div className="authContainer">
			<div className="formContainer">
				<div className="formHeader">
					{authType === "Login" ? "Sign in" : "Create an Account"}
				</div>
				<div className="formBody">
					<form onSubmit={authUser}>
						<input
							type="email"
							className="loginInput"
							placeholder="Email:"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						<input
							type="password"
							className="loginInput"
							placeholder="Password:"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
						<button className="authBtn">{authType}</button>
					</form>
					<button className="authBtn" onClick={signInWithGoogle}>
						Sign in with Google
					</button>
					<p className="authOptions">
						{authType === "Login"
							? "First time signing in?"
							: "Already have an account?"}
						<button
							className="authPrompt"
							onClick={() => changeAuthType()}
						>
							{authType === "Login"
								? "Create an account"
								: "Sign into an existing account"}
						</button>
					</p>
					<p className="errorMsg">{errorMsg}</p>
				</div>
			</div>
		</div>
	);
}

export default Auth;
