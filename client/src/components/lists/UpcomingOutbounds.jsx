import React from "react";
import { useState, useEffect, useContext } from "react";
import YardRow from "../rows/YardRow";
import { userContext } from "../../context/restaurantcontext";

const PAGE_SIZE = 10;

function UpcomingOutbounds({ type }) {
	const { setPopup } = useContext(userContext);
	const [boxes, setBoxes] = useState([]);
	const [page, setPage] = useState(0);
	var url = "/api/v1/inventory";
	if (type === "available" || type === "hold") {
		url = "/api/v1/inventory";
	} else {
		url = "/api/v1/inventory/sold";
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
				setPage(0);
			});
	}, [type, url, setPopup]);

	const pageCount = Math.ceil(boxes.length / PAGE_SIZE);
	const pageBoxes = boxes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
			<h2 className="yardHead">
				{checkTitle()}
				<span className="yardCount">{boxes.length}</span>
			</h2>
			<div className="yardScrollWrap">
				<table className="inventoryTable yardTable">
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
						{pageBoxes.map((container) => {
							return <YardRow key={container.container_id} container={container} />;
						})}
					</tbody>
				</table>
			</div>
			{pageCount > 1 && (
				<div className="yardPagination">
					<button
						className="yardPageBtn"
						onClick={() => setPage((p) => p - 1)}
						disabled={page === 0}
					>
						&#8592; Prev
					</button>
					<span className="yardPageInfo">
						{page + 1} / {pageCount}
					</span>
					<button
						className="yardPageBtn"
						onClick={() => setPage((p) => p + 1)}
						disabled={page >= pageCount - 1}
					>
						Next &#8594;
					</button>
				</div>
			)}
		</div>
	);
}

export default UpcomingOutbounds;
