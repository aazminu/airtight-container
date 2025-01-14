import React from "react";
import { useState, useEffect } from "react";
import trash from "../../assets/images/delete.png";
import downArrow from "../../assets/images/downarrow.png";
import upArrow from "../../assets/images/uparrow.png";
import InvoiceDetails from "./InvoiceDetails";
import InvoiceForm from "../forms/InvoiceForm";
function Row({ invoice, deleteInvoice }) {
	const [currentInvoice, setCurrentInvoice] = useState(invoice);
	const [invDate, setInvDate] = useState(invoice.invoice_date);
	const [regenerate, setRegenerate] = useState(false);
	const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);
	// Sanitize Date
	const regenerateInvoice = () => {
		let address = invoice.customer.contact_address;
		let tsz = address.substring(address.indexOf(",") + 1);
		address = address.substring(0, address.indexOf(",") + 1);
		setCurrentInvoice((current) => ({
			...current,
			customer: {
				...current.customer,
				contact_address: address,
				contact_tsz: tsz,
			},
		}));
		setRegenerate(!regenerate);
	};
	useEffect(() => {
		setCurrentInvoice(invoice);
	}, [invoice]);

	useEffect(() => {
		console.log(invoice);
		var newDate = invoice.invoice_date.replaceAll("T", " ");
		var ind = newDate.indexOf(".");
		setInvDate(newDate.substring(0, ind));
	}, [invoice, invoice.invoice_date]);

	return (
		<>
			<tr key={currentInvoice.invoice_id} className="invoiceRow">
				<td className="bold">{currentInvoice.invoice_number}</td>
				<td>{invDate}</td>
				<td>
					<button
						className="addBtn regenBtn"
						onClick={() => regenerateInvoice()}
					>
						Regenerate Invoice
					</button>
				</td>
				<td className="placeholderRow buttonRow" colSpan={10}>
					<button
						className="tableBtn deleteBtn"
						onClick={() => deleteInvoice(currentInvoice)}
					>
						<img src={trash} alt="Delete" width="20px"></img>
					</button>
					<button
						className="tableBtn invoiceListBtn"
						onClick={() =>
							setShowInvoiceDetails(!showInvoiceDetails)
						}
					>
						<img
							src={showInvoiceDetails ? upArrow : downArrow}
							alt="Arrow Indicator"
							width="20px"
						></img>
					</button>
				</td>
			</tr>
			{showInvoiceDetails && (
				<tr>
					<td colSpan={10} className="borderRow">
						<InvoiceDetails invoice={currentInvoice} />
					</td>
				</tr>
			)}
			{regenerate && <InvoiceForm invoiceData={currentInvoice} />}
		</>
	);
}

export default Row;
