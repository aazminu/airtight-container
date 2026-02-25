import React from "react";
import SoldRow from "./SoldRow";
import { userContext } from "../../context/restaurantcontext";

import { useState, useContext } from "react";
function InvoiceDetails({ invoice }) {
	const { setPopup } = useContext(userContext);
	const [salesTax, setSalesTax] = useState(invoice.invoice_taxed);
	const [creditCard, setCreditCard] = useState(invoice.invoice_credit);
	const [invoiceContainers, setInvoiceContainers] = useState(
		invoice.containers
	);
	const handleRemoveContainerFromInvoice = async (container_id) => {
		const confirm = window.confirm(
			"Are you sure you want to remove this container from this invoice?"
		);
		if (!confirm) return;
		fetch(`/api/v2/invoice/container/${container_id}`, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("Unable to send container back to inventory");
			}
			setInvoiceContainers(
				invoiceContainers.filter((container) => {
					return container.inventory_id !== container_id;
				})
			);
		});
	};

	const updateSalesTax = async () => {
		fetch(`/api/v2/invoice/tax/${invoice.invoice_id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ invoice_taxed: !salesTax }),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("Unable to change tax status of invoice");
				return;
			}
			setSalesTax(!salesTax);
		});
	};

	const updateCreditCardUsed = async () => {
		fetch(`/api/v2/invoice/credit/${invoice.invoice_id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ invoice_credit: !creditCard }),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("Unable to change credit card status of invoice");
				return;
			}
			setCreditCard(!creditCard);
		});
	};

	return (
		<div className="invoiceDetails">
			{/* ── Customer info — field grid ── */}
			<div className="invoiceCustomerGrid">
				<div className="drawerField">
					<span className="fieldLabel">Customer</span>
					<span className="fieldValue">{invoice.customer.contact_name}</span>
				</div>
				<div className="drawerField">
					<span className="fieldLabel">Email</span>
					<span className="fieldValue">{invoice.customer.contact_email || "—"}</span>
				</div>
				<div className="drawerField">
					<span className="fieldLabel">Phone</span>
					<span className="fieldValue">{invoice.customer.contact_phone || "—"}</span>
				</div>
				<div className="drawerField">
					<span className="fieldLabel">Address</span>
					<span className="fieldValue">{invoice.customer.contact_address || "—"}</span>
				</div>
				<div className="drawerField">
					<span className="fieldLabel">Sales Tax</span>
					<span className="fieldValue">
						<input
							type="checkbox"
							checked={salesTax}
							onChange={updateSalesTax}
						/>
					</span>
				</div>
				<div className="drawerField">
					<span className="fieldLabel">Credit Card</span>
					<span className="fieldValue">
						<input
							type="checkbox"
							checked={creditCard}
							onChange={updateCreditCardUsed}
						/>
					</span>
				</div>
			</div>

			{/* ── Containers table ── */}
			<div className="invoiceContainersWrap">
				<table className="invoiceTable">
					<thead>
						<tr className="invoiceSubHead">
							<th scope="col">Unit Number</th>
							<th scope="col">Outbound Date</th>
							<th scope="col">Size</th>
							<th scope="col">Sale Price</th>
							<th scope="col">Trucking Rate</th>
							<th scope="col">Modification Cost</th>
							<th scope="col">Destination</th>
							<th colSpan={3}></th>
						</tr>
					</thead>
					<tbody>
						{invoiceContainers.map((container) => (
							<SoldRow
								key={container.inventory_id}
								container={container}
								onDelete={handleRemoveContainerFromInvoice}
							/>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default InvoiceDetails;
