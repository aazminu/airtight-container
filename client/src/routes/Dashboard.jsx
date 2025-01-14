import React from "react";
import { useState } from "react";
import "../styles/dashboard.css";
import SetReleases from "../components/forms/SetReleases";
import UserList from "../components/lists/UserList";

function Dashboard() {
	const [currTab, setCurrTab] = useState("releases");
	return (
		<div className="dashContainer">
			<h1 className="invHeader">Dashboard</h1>
			<div className="dashOptions">
				<button
					className={
						currTab === "releases"
							? "addBtn dashBtn selectedOption"
							: "addBtn"
					}
					onClick={() => setCurrTab("releases")}
				>
					Releases
				</button>
				<button
					className={
						currTab === "acct" ? "addBtn selectedOption" : "addBtn"
					}
					onClick={() => setCurrTab("acct")}
				>
					Account Management
				</button>
			</div>

			<div className={currTab === "releases" ? "" : "hidden"}>
				<SetReleases />
			</div>
			<div className={currTab === "acct" ? "" : "hidden"}>
				<UserList />
			</div>
		</div>
	);
}

export default Dashboard;
