import React from "react";
import { useState, useEffect } from "react";
import InvoiceForm from "../forms/InvoiceForm";
function SendInvoice({ generate }) {
	const [unitNumber, setUnitNumber] = useState("");
	const [fields, setFields] = useState(false);
	const [invoiceContainers, setInvoiceContainers] = useState([]);
	const [options, setOptions] = useState([]);

	useEffect(() => {
		fetch("http://localhost:8080/api/v1/inventory/sold", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					console.log("shit");
					return;
				}
				return res.json();
			})
			.then((data) => {
				console.log(data);
				setOptions(data.data.inventory);
			});
	}, []);

	const changeUnitNumber = (e) => {
		setUnitNumber(e.target.value);
	};

	const updateInvoiceContainers = (e) => {
		var numSelected = e.target.selectedOptions.length;
		var selectedArr = [];
		for (var i = 0; i < numSelected; i++) {
			var currentOption = e.target.selectedOptions[i].value;
			selectedArr.push(
				options.find((element) => element.unit_number === currentOption)
			);
		}
		setInvoiceContainers(selectedArr);
	};

	return (
		<div className="repContainer">
			<div className="card">
				<div className="reportTitle">Send/Create Invoice</div>
				<div className="reportDesc">
					<p>
						Create an invoice and send a copy to both the customer
						and company with an option to print. <br /> <br />
						<span className="nowrap">
							Select Unit(s) (Shift+Click to select multiple
							units):
						</span>
					</p>
				</div>
				<label>
					<select
						multiple="true"
						defaultValue=""
						onChange={updateInvoiceContainers}
						className="repSelect"
					>
						{options.map((option) => {
							return (
								<option value={option.unit_number}>
									{option.unit_number}
								</option>
							);
						})}
					</select>
				</label>
				{invoiceContainers.length > 0 && (
					<InvoiceForm containerData={invoiceContainers} />
				)}
			</div>
		</div>
	);
}

export default SendInvoice;
