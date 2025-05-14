import React from "react";
import SoldRow from "./SoldRow";
import { userContext } from "../../context/restaurantcontext";

import { useState, useContext } from "react";
function InvoiceDetails({ invoice }) {
	const { setPopup } = useContext(userContext);
	const [salesTax, setSalesTax] = useState(invoice.invoice_taxed);
	const [invoiceContainers, setInvoiceContainers] = useState(
		invoice.containers
	);
	const handleRemoveContainerFromInvoice = async (container_id) => {
		const confirm = window.confirm(
			"Are you sure you want to remove this container from this invoice?"
		);
		if (!confirm) return;
		fetch(
			`http://localhost:8080/api/v2/invoice/container/${container_id}`,
			{
				method: "DELETE",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			}
		).then((res) => {
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

	const updateSalesTax = async (e) => {
		fetch(`http://localhost:8080/api/v2/invoice/${invoice.invoice_id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				invoice_taxed: !salesTax,
			}),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("Unable to change tax status of invoice");
				return;
			}
			setSalesTax(!salesTax);
		});
	};
	return (
		<div className="invoiceDetails">
			<div>
				<table className="invoiceTable customerTab">
					<tr className="inventoryHeader invoiceSubHead">
						<th scope="col">Customer Name</th>
						<th scope="col">Email Address</th>
						<th scope="col">Phone Number</th>
						<th scope="col">Business/Home Address</th>
						<th scope="col">Sales Tax Applied</th>
					</tr>
					<tr className="invoiceRow">
						<td>{invoice.customer.contact_name}</td>
						<td>{invoice.customer.contact_email}</td>
						<td>{invoice.customer.contact_phone}</td>
						<td>{invoice.customer.contact_address}</td>
						<td>
							<span className="checkboxLine invoiceCheck">
								<input
									type="checkbox"
									checked={salesTax}
									onChange={updateSalesTax}
								></input>
							</span>
						</td>
					</tr>
				</table>
			</div>
			<div>
				<table className="invoiceTable">
					<tr className="inventoryHeader invoiceSubHead">
						<th scope="col">Unit Number</th>
						<th scope="col">Outbound Date</th>
						<th scope="col">Size</th>
						<th scope="col">Sale Price</th>
						<th scope="col">Trucking Rate</th>
						<th scope="col">Modification Cost</th>
						<th scope="col">Destination</th>
						<th colSpan={3}></th>
					</tr>
					{invoiceContainers.map((container) => {
						return (
							<>
								<SoldRow
									container={container}
									onDelete={handleRemoveContainerFromInvoice}
								/>
							</>
						);
					})}
				</table>
			</div>
		</div>
	);
}

export default InvoiceDetails;
