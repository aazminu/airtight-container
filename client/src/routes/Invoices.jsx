import React from "react";
import InvoiceList from "../components/lists/InvoiceList";
import { useNavigate } from "react-router-dom";
function Invoices() {
	const navigate = useNavigate();
	return (
		<div className="invoiceWrapper">
			<h1 className="invHeader">Invoices</h1>
			<button
				className="addBtn createInvoiceBtn"
				onClick={() => navigate("/invoices/create")}
			>
				Make New Invoice
			</button>
			<InvoiceList />
		</div>
	);
}

export default Invoices;
