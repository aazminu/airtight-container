import React from "react";
import { useState, useEffect, useContext } from "react";
import YardRow from "../rows/YardRow";
import { userContext } from "../../context/restaurantcontext";
function UpcomingOutbounds({ type }) {
	const { setPopup } = useContext(userContext);
	const [boxes, setBoxes] = useState([]);
	var url = "http://localhost:8080/api/v1/inventory";
	if (type === "available" || type === "hold") {
		url = "http://localhost:8080/api/v1/inventory";
	} else {
		url = "http://localhost:8080/api/v1/inventory/sold";
	}
	useEffect(() => {
		fetch(url, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to get inventory");
					return undefined;
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				var filtered = data.data.inventory.filter((container) => {
					return container.state === type;
				});
				setBoxes(filtered);
			});
	}, [type, url, setPopup]);
	const checkTitle = () => {
		if (type === "available") {
			return "Available Units";
		} else if (type === "hold") {
			return "Held Units";
		} else if (type === "sold") {
			return "Sold Units";
		} else {
			return "Outbounds";
		}
	};
	return (
		<div className={`${type}Container`}>
			<span>
				<h2 className="yardHead">{checkTitle()}</h2>
			</span>
			<div className="selectorTable">
				<table className={`inventoryTable yardTable`}>
					<thead>
						<tr>
							<th>Unit Number</th>
							<th>Size</th>
							{type === "sold" && (
								<>
									<th>Outbound Date</th>
									<th>Release Number</th>
								</>
							)}
						</tr>
					</thead>
					<tbody>
						{boxes.map((container) => {
							return <YardRow container={container} />;
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default UpcomingOutbounds;
