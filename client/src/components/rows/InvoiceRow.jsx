import React from "react";
import { useState, useEffect } from "react";
import InvoiceDetails from "./InvoiceDetails";
import InvoiceForm from "../forms/InvoiceForm";
import EmailPrompt from "../EmailPrompt";

function Row({ invoice, deleteInvoice }) {
	const [currentInvoice, setCurrentInvoice] = useState(invoice);
	const [invDate, setInvDate] = useState(invoice.invoice_date);
	const [regenerate, setRegenerate] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [showEmailPrompt, setShowEmailPrompt] = useState(false);
	const [sendingEmail, setSendingEmail] = useState(false);

	useEffect(() => {
		setCurrentInvoice(invoice);
	}, [invoice]);

	useEffect(() => {
		var newDate = invoice.invoice_date.replaceAll("T", " ");
		var ind = newDate.indexOf(".");
		setInvDate(newDate.substring(0, ind));
	}, [invoice, invoice.invoice_date]);

	const retrievePromptRes = (res) => {
		setShowEmailPrompt(false);
		if (res === "CANCEL") return;
		setSendingEmail(res);
		regenerateInvoice();
	};

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

	return (
		<>
			{/* ── Collapsed row — click to expand ── */}
			<tr className="inventoryRow" onClick={() => setExpanded((p) => !p)}>
				<td style={{ paddingLeft: "18px", fontWeight: 600 }}>
					#{currentInvoice.invoice_number}
				</td>
				<td>{currentInvoice.customer?.contact_name || "—"}</td>
				<td>{invDate}</td>
				<td className="chevronCell">
					<span className={`expandChevron${expanded ? " open" : ""}`}>›</span>
				</td>
			</tr>

			{/* ── Expanded drawer (always rendered; height via CSS grid trick) ── */}
			<tr className={`expandedRow${expanded ? " drawerOpen" : ""}`}>
				<td colSpan={4}>
					<div className="drawerSlide">
						<div className="expandedDrawer">
							<div className="drawerInner invoiceDrawer">
								<div className="invoiceContainerCard">
									<InvoiceDetails invoice={currentInvoice} />
									<div className="drawerActions">
									<button
										className="drawerBtn"
										onClick={(e) => {
											e.stopPropagation();
											setShowEmailPrompt(true);
										}}
									>
										Regenerate Invoice
									</button>
									<button
										className="drawerBtn drawerBtnDanger"
										onClick={(e) => {
											e.stopPropagation();
											deleteInvoice(currentInvoice);
										}}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true" style={{flexShrink:0}}>
											<path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
										</svg> Delete Invoice
									</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				</td>
			</tr>

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
