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
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		})
			.then((res) => {
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
		const confirm = window.confirm("Are you sure you want to delete this container?");
		if (!confirm) return;
		try {
			await fetch(`/api/v1/inventory/${id}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
			});
			setInventory(inventory.filter((c) => c.id !== id));
		} catch {
			setPopup("ERROR There was a problem deleting this container.");
		}
	};

	var maxPageNumber = Math.ceil(inventory.length / displayNum);
	if (inventory.length % displayNum === 0) maxPageNumber += 1;

	useEffect(() => {
		var start = (page - 1) * displayNum;
		setCurrentPage(inventory.slice(start, start + displayNum));
	}, [page, displayNum, inventory]);

	const searchContainers = (value) => {
		if (value === "") { setFilters([]); return; }
		var filterHolder = [];
		for (let i = 0; i < inventory.length; i++) {
			if (!JSON.stringify(inventory[i]).toLowerCase().includes(value.toLowerCase())) {
				filterHolder.push(inventory[i].id);
			}
		}
		setFilters(filterHolder);
	};

	const changePageDisplay = (e) => setDisplayNum(e.target.value);

	const displayedRows = filters.length > 0
		? inventory.filter((c) => !filters.includes(c.id))
		: currentPage;

	return (
		<div className="inventoryContainer">
			<SearchContainers search={searchContainers} />
			<table className="inventoryTable">
				<thead>
					<tr className="inventoryHeader">
						<th scope="col">Unit #</th>
						<th scope="col">Size</th>
						<th scope="col">State</th>
						<th scope="col">Sale Company</th>
						<th scope="col">Date Added</th>
						<th scope="col" style={{ width: "40px" }}></th>
					</tr>
				</thead>
				<tbody className="inventoryBody">
					{displayedRows.map((container) => (
						<Row
							container={container}
							onDelete={handleDelete}
							key={container.id}
						/>
					))}
				</tbody>
				<tfoot>
					<tr>
						<td colSpan={6} className="tablePagination">
							<button
								className="arrow"
								onClick={page !== 1 ? () => setPage(page - 1) : undefined}
							>
								<img src={leftarrow} alt="previous" width="10px" />
							</button>
							<span className="pageDisplay">
								Page {page} of {maxPageNumber}
							</span>
							<button
								className="arrow"
								onClick={page !== maxPageNumber ? () => setPage(page + 1) : undefined}
							>
								<img src={rightarrow} alt="next" width="10px" />
							</button>
							<span className="pageDisplay" style={{ marginLeft: "12px" }}>
								Per page:
							</span>
							<select className="pgDisplayDropdown" onChange={changePageDisplay}>
								<option value={10}>10</option>
								<option value={20}>20</option>
								<option value={40}>40</option>
								<option value={50}>50</option>
							</select>
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}

export default InventoryList;
