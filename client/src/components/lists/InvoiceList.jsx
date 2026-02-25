import React from "react";
import { useEffect, useState, useContext } from "react";
import "../../styles/invoicelist.css";
import InvoiceRow from "../rows/InvoiceRow";
import SearchContainers from "../SearchContainers";
import rightarrow from "../../assets/images/rightarrow.png";
import leftarrow from "../../assets/images/leftarrow.png";
import { userContext } from "../../context/restaurantcontext";

function InvoiceList() {
	const { setPopup } = useContext(userContext);
	const [invoices, setInvoices] = useState([]);
	const [filters, setFilters] = useState([]);
	const [page, setPage] = useState(1);
	const [displayNum, setDisplayNum] = useState(40);
	const [currentPage, setCurrentPage] = useState([]);

	useEffect(() => {
		fetch("/api/v2/invoice", {
			method: "GET",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) return;
				return res.json();
			})
			.then((data) => {
				setInvoices(data.data.invoices);
			});
	}, []);

	const handleDeleteInvoice = async (invoice) => {
		const confirm = window.confirm(
			`Are you sure you want to delete invoice ${invoice.invoice_id}?`
		);
		if (!confirm) return;

		for (const container of invoice.containers) {
			deleteContainerFromInvoice(container.inventory_id);
		}

		fetch(`/api/v2/invoice/${invoice.invoice_id}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		}).then((res) => {
			if (!res.ok) { setPopup("Error Deleting This Invoice"); return; }
			setInvoices(invoices.filter((e) => e.invoice_id !== invoice.invoice_id));
		});
	};

	const deleteContainerFromInvoice = async (container_id) => {
		fetch(`/api/v2/invoice/container/${container_id}`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
		}).then((res) => {
			if (!res.ok) setPopup("Unable to remove container from invoice");
		});
	};

	var maxPageNumber = Math.ceil(invoices.length / displayNum);
	if (invoices.length % displayNum === 0) maxPageNumber += 1;

	useEffect(() => {
		var start = (page - 1) * displayNum;
		setCurrentPage(invoices.slice(start, start + displayNum));
	}, [page, displayNum, invoices]);

	const searchContainers = (value) => {
		if (value === "") { setFilters([]); return; }
		var filterHolder = [];
		for (let i = 0; i < invoices.length; i++) {
			if (!JSON.stringify(invoices[i]).toLowerCase().includes(value.toLowerCase())) {
				filterHolder.push(invoices[i].invoice_id);
			}
		}
		setFilters(filterHolder);
	};

	const changePageDisplay = (e) => setDisplayNum(e.target.value);

	const displayedRows = filters.length > 0
		? invoices.filter((inv) => !filters.includes(inv.invoice_id))
		: currentPage;

	return (
		<div className="inventoryContainer">
			<SearchContainers search={searchContainers} />
			<table className="invoiceTable superInvoiceTable">
				<thead>
					<tr className="inventoryHeader">
						<th>Invoice #</th>
						<th>Customer</th>
						<th>Date</th>
						<th style={{ width: "40px" }}></th>
					</tr>
				</thead>
				<tbody className="inventoryBody">
					{displayedRows.map((invoice) => (
						<InvoiceRow
							invoice={invoice}
							deleteInvoice={handleDeleteInvoice}
							key={invoice.invoice_id}
						/>
					))}
				</tbody>
				<tfoot>
					<tr>
						<td colSpan={4} className="tablePagination">
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
							<span className="pageDisplay" style={{ marginLeft: "12px" }}>Per page:</span>
							<select className="pgDisplayDropdown" onChange={changePageDisplay} defaultValue={40}>
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

export default InvoiceList;
