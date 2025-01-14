import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";
import SearchContainers from "../SearchContainers";

function SelectContainers({ sendSelectedContainers }) {
	const { setPopup } = useContext(userContext);
	const [filters, setFilters] = useState([]);
	const [containers, setContainers] = useState([]);

	useEffect(() => {
		fetch(`api/v1/inventory/state`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				state: "available",
			}),
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Could not get available containers");
					return;
				}
				return res.json();
			})
			.then((data) => {
				setContainers(
					data.data.inventory.map((container) => ({
						// Object.defineProperty(container, "added", { value: false });
						...container,
						added: false,
						sale_price: 0,
						modification_price: 0,
						trucking_rate: 0,
						invoice_notes: "",
						destination: "",
					}))
				);
			});
	}, [setPopup]);

	const searchContainers = (value) => {
		if (value === "") {
			setFilters([]);
			return;
		}
		var filterHolder = [];
		for (let i = 0; i < containers.length; i++) {
			if (
				!JSON.stringify(containers[i])
					.toLowerCase()
					.includes(value.toLowerCase())
			) {
				filterHolder.push(containers[i].id);
			}
		}
		setFilters(filterHolder);
		filterHolder = [];
	};

	const updateContainers = (e, container) => {
		let updatedCopy = containers.map((item) => {
			return item.id === container.id
				? { ...item, added: e.target.checked }
				: item;
		});
		sendSelectedContainers(
			updatedCopy.filter((container) => container.added)
		);
		setContainers(updatedCopy);
	};
	return (
		<div className="invoiceCreatorWrapper searchComponent">
			<SearchContainers search={searchContainers} />
			<div className="selectorTable searchComponent">
				<table className="inventoryTable">
					<thead>
						<tr className="inventoryHeader searchTable">
							<th>Unit Number</th>
							<th>Size</th>
							<th>Select?</th>
						</tr>
					</thead>
					<tbody>
						{filters.length > 0
							? containers.map((container) => {
									return (
										!filters.includes(container.id) && (
											<tr>
												<td>{container.unit_number}</td>
												<td>{container.size}</td>
												<td>
													<span className="checkboxLine invoiceCheck">
														<input
															type="checkbox"
															checked={
																container.added
															}
															onChange={(e) =>
																updateContainers(
																	e,
																	container
																)
															}
														></input>
													</span>
												</td>
											</tr>
										)
									);
							  })
							: containers.map((container) => {
									return (
										<tr>
											<td>{container.unit_number}</td>
											<td>{container.size}</td>
											<td>
												<span className="checkboxLine invoiceCheck">
													<input
														type="checkbox"
														checked={
															container.added
														}
														onChange={(e) =>
															updateContainers(
																e,
																container
															)
														}
													></input>
												</span>
											</td>
										</tr>
									);
							  })}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default SelectContainers;
