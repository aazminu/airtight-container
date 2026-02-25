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
		setErrorMsg("");
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
			<div className="authCard">
				<div className="authCardHead">
					{authType === "Login" ? "Sign In" : "Register"}
				</div>
				<div className="authCardBody">
					<form onSubmit={authUser}>
						<div className="authField">
							<label className="authLabel">Email</label>
							<input
								type="email"
								className="authInput"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</div>
						<div className="authField">
							<label className="authLabel">Password</label>
							<input
								type="password"
								className="authInput"
								placeholder="••••••••"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
						</div>
						<button className="authSubmitBtn">
							{authType === "Login" ? "Sign In" : "Create Account"}
						</button>
					</form>
					<div className="authDivider">or</div>
					<button className="authGoogleBtn" onClick={signInWithGoogle}>
						Sign in with Google
					</button>
					<p className="authFooter">
						{authType === "Login" ? "New here?" : "Have an account?"}
						<button className="authToggleBtn" onClick={changeAuthType}>
							{authType === "Login" ? "Create an account" : "Sign in"}
						</button>
					</p>
					{errorMsg && <p className="authError">{errorMsg}</p>}
				</div>
			</div>
		</div>
	);
}

export default Auth;
