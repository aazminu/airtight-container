import React from "react";
import { useEffect, useState, useContext } from "react";
import "../../styles/inventorylist.css";
import rightarrow from "../../assets/images/rightarrow.png";
import leftarrow from "../../assets/images/leftarrow.png";
import SearchContainers from "../SearchContainers";
import Row from "../rows/Row";
import { userContext } from "../../context/restaurantcontext";

function InventoryList() {
	const { setPopup } = useContext(userContext);
	const [inventory, setInventory] = useState([]);
	const [filters, setFilters] = useState([]);
	const [page, setPage] = useState(1);
	const [displayNum, setDisplayNum] = useState(10);
	const [currentPage, setCurrentPage] = useState([]);

	useEffect(() => {
		fetch("/api/v1/inventory", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				console.log("STATUS", res.status);
				if (!res.ok) {
					setPopup("ERROR Unable to get Inventory");
					return undefined;
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				setInventory(data.data.inventory);
			});
	}, [setPopup]);

	const handleDelete = async (id) => {
		const confirm = window.confirm(
			"Are you sure you want to delete this container?"
		);
		if (!confirm) return;

		try {
			await fetch(`/api/v1/inventory/${id}`, {
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			});
			setInventory(
				inventory.filter((container) => {
					return container.id !== id;
				})
			);
		} catch (error) {
			setPopup("ERROR There was a problem deleting this container.");
		}
	};

	var maxPageNumber = Math.ceil(inventory.length / displayNum);
	if (inventory.length % displayNum === 0) maxPageNumber += 1;

	useEffect(() => {
		var start = (page - 1) * displayNum;
		var end = start + displayNum;
		var pageHolder = inventory.slice(start, end);
		console.log(pageHolder);
		setCurrentPage(pageHolder);
	}, [page, displayNum, inventory]);

	// FILTERS:
	const searchContainers = (value) => {
		if (value === "") {
			setFilters([]);
			return;
		}
		var filterHolder = [];
		for (let i = 0; i < inventory.length; i++) {
			if (
				!JSON.stringify(inventory[i])
					.toLowerCase()
					.includes(value.toLowerCase())
			) {
				filterHolder.push(inventory[i].id);
			}
		}
		setFilters(filterHolder);
		filterHolder = [];
	};

	const changePageDisplay = (e) => {
		setDisplayNum(e.target.value);
	};

	return (
		<>
			<div className="inventoryContainer">
				<SearchContainers search={searchContainers} />
				<table className="inventoryTable">
					<thead>
						<tr className="inventoryHeader">
							<th scope="col">Date Added</th>
							<th scope="col">Unit Number</th>
							<th scope="col">Size</th>
							<th scope="col" className="damageCol">
								Damage
							</th>
							<th scope="col" className="tcCol">
								Trucking Company
							</th>
							<th scope="col">Acceptance Number</th>
							<th scope="col" className="scCol">
								Sale Company
							</th>
							<th scope="col">Aquisition Price</th>
							<th scope="col">State</th>
							<th scope="col">Notes</th>
							<th
								scope="col"
								className="placeholderRow pageRow"
								colSpan={2}
							>
								<button
									className="arrow"
									onClick={
										page !== 1
											? () => setPage(page - 1)
											: () => setPage(page)
									}
								>
									<img
										src={leftarrow}
										alt="left"
										width="10px"
									></img>
								</button>
								<span className="pageDisplay">
									Page {page} of {maxPageNumber}
								</span>
								<button
									className="arrow"
									onClick={
										page !== maxPageNumber
											? () => setPage(page + 1)
											: () => setPage(page)
									}
								>
									<img
										src={rightarrow}
										alt="right"
										width="10px"
									></img>
								</button>
							</th>
							<th
								scope="col"
								className="placeholderRow"
								colSpan={3}
							>
								<label>
									<span className="pageDisplay">
										Results Per Page:
									</span>
								</label>
								<select
									className="pgDisplayDropdown"
									onChange={changePageDisplay}
								>
									<option value={10}>10</option>
									<option value={20}>20</option>
									<option value={40}>40</option>
									<option value={50}>50</option>
								</select>
							</th>
						</tr>
					</thead>
					<tbody className="inventoryBody">
						{filters.length > 0
							? inventory.map((container) => {
									return (
										!filters.includes(container.id) && (
											<Row
												container={container}
												onDelete={handleDelete}
												key={container.id}
											/>
										)
									);
							  })
							: currentPage.map((container) => {
									return (
										<Row
											container={container}
											onDelete={handleDelete}
											key={container.id}
										/>
									);
							  })}
					</tbody>
				</table>
			</div>
		</>
	);
}

export default InventoryList;
