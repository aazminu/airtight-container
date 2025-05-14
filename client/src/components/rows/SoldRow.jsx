import React from "react";
import { useState, useEffect, useContext } from "react";
import UpdateSold from "../forms/UpdateSold";
import edit from "../../assets/images/edit.png";
import outboundIcon from "../../assets/images/outboundIcon.png";
import trash from "../../assets/images/delete.png";
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
			`http://localhost:8080/api/v1/inventory/sold/invoice/${updatedContainer.inventory_id}`,
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

		fetch(
			`http://localhost:8080/api/v1/inventory/outbound/${currentContainer.inventory_id}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			}
		)
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
							<img
								src={outboundIcon}
								alt="Outbound"
								width="25px"
								a
							/>
						</button>
					)}
				</td>
				<td>
					<button
						className="editBtn"
						onClick={() => setShowEdit(!showEdit)}
					>
						<img src={edit} alt="Edit Unit" width="20px" />
					</button>
				</td>
				<td className="soldDeleteBtn">
					<button
						className="tableBtn deleteBtn"
						onClick={() => onDelete(currentContainer.inventory_id)}
					>
						<img src={trash} alt="Delete" width="20px"></img>
					</button>
				</td>
			</tr>
			{showEdit && (
				<tr>
					<td colSpan={18}>
						<UpdateSold
							container={currentContainer}
							save={saveEdits}
							close={closeEdit}
						/>
					</td>
				</tr>
			)}
		</>
	);
}

export default SoldRow;
