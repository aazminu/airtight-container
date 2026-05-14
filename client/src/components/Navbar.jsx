import React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../styles/navbar.css";
import logo from "../assets/images/airtightfixed.png";
import { userContext } from "../context/restaurantcontext";
import { PendingAuditNav } from "./PendingAuditNav";
import UserAvatar from "./UserAvatar";
import { setLanguage } from "../i18n";

function Navbar() {
	const [showUserOps, setShowUserOps] = useState(false);
	const { user, setUser, setPopup, theme, toggleTheme } = useContext(userContext);
	const profileRef = useRef(null);
	const { i18n, t } = useTranslation();
	const currentLang = i18n.resolvedLanguage === "es" ? "es" : "en";

	useEffect(() => {
		if (!showUserOps) return;
		const onDown = (e) => {
			if (profileRef.current && !profileRef.current.contains(e.target)) {
				setShowUserOps(false);
			}
		};
		const onKey = (e) => {
			if (e.key === "Escape") setShowUserOps(false);
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [showUserOps]);

	const logout = () => {
		fetch("/api/auth/sign-out", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		}).then((res) => {
			if (!res.ok) return setPopup("ERROR There was an error logging out");
			setUser({ email: "unauthorized", permissions: "unauthorized" });
			window.location.href = "/auth";
		});
	};

	return (
		<div className="navbarOuter">
			<div className="navbar">
				<a href="/" className="navbarBrand" aria-label="Airtight home">
					<img src={logo} alt="Airtight logo" className="navbarLogo" />
				</a>
				<nav>
					{user.permissions !== "unauthorized" && (
						<ul>
							{user.permissions === "admin" && (
								<>
									<li>
										<a href="/">Inventory</a>
									</li>
									<li>
										<a href="/invoices">Invoices</a>
									</li>
									<li>
										<a href="/reports">Reports</a>
									</li>
									<li>
										<a href="/dashboard">Dashboard</a>
									</li>
									<li>
										<a href="/clients">Clients</a>
									</li>
									<li>
										<a href="/releases">Releases</a>
									</li>
									<li>
										<PendingAuditNav />
									</li>
								</>
							)}
							<li>
								<a href="/yardview">{t("navbar.yard_view")}</a>
							</li>
							<li>
								<a href="/intake">{t("navbar.add_a_box")}</a>
							</li>
							<li>
								<a href="/help">{t("navbar.help")}</a>
							</li>
						</ul>
					)}
				</nav>
				<div className="navbarRight">
					<div
						className="langToggle"
						role="group"
						aria-label="Language"
					>
						<button
							type="button"
							className={`langOption${currentLang === "en" ? " langOptionActive" : ""}`}
							onClick={() => setLanguage("en")}
							aria-pressed={currentLang === "en"}
						>
							EN
						</button>
						<button
							type="button"
							className={`langOption${currentLang === "es" ? " langOptionActive" : ""}`}
							onClick={() => setLanguage("es")}
							aria-pressed={currentLang === "es"}
						>
							ES
						</button>
					</div>
					<button
						className="themeToggle"
						onClick={toggleTheme}
						aria-label={t("navbar.toggle_dark")}
						data-theme-active={theme}
					>
						<span className="themeToggleThumb"></span>
					</button>
					<div className="profileContainer" ref={profileRef}>
						<UserAvatar
							email={user.email}
							size={36}
							onClick={() => setShowUserOps(!showUserOps)}
						/>
						{showUserOps && (
							<div className="profileDropdown" role="menu">
								<div className="profileEmail" title={user.email}>
									{user.email === "unauthorized"
										? t("navbar.guest")
										: user.email}
								</div>
								<div className="profileRole">
									{user.permissions === "admin"
										? t("navbar.admin")
										: user.permissions === "employee"
											? t("navbar.employee")
											: ""}
								</div>
								<button
									type="button"
									className="logoutBtn authBtn"
									onClick={logout}
								>
									{t("navbar.logout")}
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export default Navbar;
