import React from "react";
import { useState, useEffect, useContext } from "react";
import UpdateSold from "../forms/UpdateSold";
import { userContext } from "../../context/restaurantcontext";
function SoldRow({ container, onDelete }) {
	const { setPopup } = useContext(userContext);
	const date = new Date();
	const offset = date.getTimezoneOffset() / 60;
	const [currentContainer, setCurrentContainer] = useState(container);
	const [outboundTime, setOutboundTime] = useState(container.outbound_date);
	const [invTime, setInvTime] = useState("");
	const [showEdit, setShowEdit] = useState(false);

	// Sanitize outbound_date for display if it exists
	useEffect(() => {
		if (!currentContainer.outbound_date) return;
		var breakInd = container.outbound_date.indexOf("T");
		setOutboundTime(container.outbound_date.substr(0, breakInd));

		var containerTime = currentContainer.outbound_date.substr(11, 8);
		var hour = 0;

		for (var i = 0; i < containerTime.length; i++) {
			var char = containerTime.charAt(i);
			if (char === ":") {
				break;
			} else {
				if (i === 0) hour += Number(char) * 10;
				else hour += Number(char);
			}
		}
		hour -= offset;
		if (hour < 0) hour += 24;

		let str = hour.toString();
		if (str.length === 1) str = "0" + str;
		setInvTime(str + containerTime.substr(2, 6));
	}, [
		currentContainer.outbound_date,
		offset,
		showEdit,
		container.outbound_date,
	]);

	const saveEdits = (updatedContainer) => {
		console.log(updatedContainer);
		fetch(
			`/api/v1/inventory/sold/invoice/${updatedContainer.inventory_id}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(updatedContainer),
				credentials: "include",
			}
		).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Failed to edit container");
			}
			setCurrentContainer(updatedContainer);
			setShowEdit(!showEdit);
			return res.json();
		});

		window.location.reload();
	};

	const markOutbound = () => {
		console.log("CONTAINER: \n");
		console.log(currentContainer);
		if (currentContainer.state === "outbound") {
			setPopup("ERROR Container already marked as outbound");
			return;
		}
		const confirm = window.confirm(
			"Are you sure you want to mark this container as outbound?"
		);
		if (!confirm) return;

		fetch(`/api/v1/inventory/outbound/${currentContainer.inventory_id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to mark outbound");
					return undefined;
				} else {
					setPopup("Converted to outbound.");
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				setCurrentContainer((prev) => ({
					...prev,
					outbound_date: data.data.inventory[0].outbound_date,
					state: "outbound",
				}));
			});
	};
	const closeEdit = () => {
		setShowEdit(!showEdit);
	};
	return (
		<>
			<tr key={currentContainer.unit_number}>
				<td>{currentContainer.unit_number}</td>
				<td className="dateRow">
					{outboundTime ? (
						<>
							{outboundTime} <br /> {invTime}{" "}
						</>
					) : (
						"N/A"
					)}
				</td>
				<td>{currentContainer.size}</td>
				<td>
					{currentContainer.sale_price
						? `$${currentContainer.sale_price}`
						: "N/A"}
				</td>
				<td>
					{currentContainer.trucking_rate
						? `$${currentContainer.trucking_rate}`
						: "N/A"}
				</td>
				<td>
					{currentContainer.modification_price
						? `$${currentContainer.modification_price}`
						: "N/A"}
				</td>
				<td>
					{currentContainer.destination
						? `${currentContainer.destination}`
						: "N/A"}
				</td>
				<td>
					{container.state !== "outbound" && (
						<button
							className="editBtn"
							onClick={() => markOutbound()}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
								<path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
								<path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
							</svg>
						</button>
					)}
				</td>
				<td>
					<button
						className="editBtn"
						onClick={() => setShowEdit(!showEdit)}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
							<path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
							<path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
						</svg>
					</button>
				</td>
				<td className="soldDeleteBtn">
					<button
						className="tableBtn deleteBtn"
						onClick={() => onDelete(currentContainer.inventory_id)}
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
						<path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
					</svg>
					</button>
				</td>
			</tr>
			<tr className={`updateRow${showEdit ? " drawerOpen" : ""}`}>
				<td colSpan={10}>
					<div className="drawerSlide">
						<div className="expandedDrawer">
							<UpdateSold
								container={currentContainer}
								save={saveEdits}
								close={closeEdit}
							/>
						</div>
					</div>
				</td>
			</tr>
		</>
	);
}

export default SoldRow;
