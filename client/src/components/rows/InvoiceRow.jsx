import React from "react";
import { useState, useEffect } from "react";
import trash from "../../assets/images/delete.png";
import downArrow from "../../assets/images/downarrow.png";
import upArrow from "../../assets/images/uparrow.png";
import InvoiceDetails from "./InvoiceDetails";
import InvoiceForm from "../forms/InvoiceForm";
import EmailPrompt from "../EmailPrompt";
function Row({ invoice, deleteInvoice }) {
	// Container for invoice data
	const [currentInvoice, setCurrentInvoice] = useState(invoice);
	const [invDate, setInvDate] = useState(invoice.invoice_date);
	// Bool to render the invoice upon clicking "regenerate"
	const [regenerate, setRegenerate] = useState(false);
	// Bool to conditionally render the customer/container details per invoice
	const [showInvoiceDetails, setShowInvoiceDetails] = useState(false);
	// Bool to conditionally render the customer/container details per invoice
	const [showEmailPrompt, setShowEmailPrompt] = useState(false);
	// Retrieves result of prompt and passes on to generator
	const [sendingEmail, setSendingEmail] = useState(false);

	// Initialize invoice with passed data
	useEffect(() => {
		setCurrentInvoice(invoice);
	}, [invoice]);

	// Expects a bool returned from <EmailPrompt/> component's setSendEmail
	const retrievePromptRes = (res) => {
		setShowEmailPrompt(!showEmailPrompt);
		if (res === "CANCEL") return;
		setSendingEmail(res);
		// Hide prompt & regenerate
		regenerateInvoice();
	};

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
						onClick={() => setShowEmailPrompt(!showEmailPrompt)}
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

			{showEmailPrompt && (
				<EmailPrompt setSendEmail={retrievePromptRes} />
			)}

			{regenerate && (
				<InvoiceForm
					invoiceID={currentInvoice.invoice_id}
					sendEmail={sendingEmail}
				/>
			)}
		</>
	);
}

export default Row;
