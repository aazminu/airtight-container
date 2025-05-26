import React from "react";
import { useState, useContext } from "react";
import SelectContainers from "../components/forms/SelectContainers";
import "../styles/invoicecreator.css";
import SelectCustomer from "../components/forms/SelectCustomer";
import { userContext } from "../context/restaurantcontext";
import ContainerInvoice from "../components/forms/ContainerInvoice";
import InvoiceForm from "../components/forms/InvoiceForm";

function CreateInvoice() {
	/*
	 TODO: Whole thing is kinda fucked because state is lost when back/next is hit
	 need to maintain each subcomponent's state by passing/updating out somehow
	 this is a problem for tomorrow harry
	 UPDATE: Tomorrow harry does not feel like doing this he could do it with context
	 		 but that's a lot of effort
	*/
	const { setPopup } = useContext(userContext);
	const [finalInvoiceInfo, setFinalInvoiceInfo] = useState(null);
	const [genInvoiceID, setGenInvoiceID] = useState(0);

	const [generate, setGenerate] = useState(false);
	const [step, setStep] = useState(1);
	const stepInstructions = [
		"Select Containers Sold",
		"Select or Add Customer",
		"Input Final Container Details",
	];
	const [selectedContainers, setSelectedContainers] = useState([]);
	const [selectedContact, setSelectedContact] = useState({
		contact_id: "null",
	});
	const [emailContact, setEmailContact] = useState(false);
	const [hasSalesTax, setHasSalesTax] = useState(false);
	const [usingCreditCard, setUsingCreditCard] = useState(false);

	const generateInvoice = async () => {
		const newInvoiceNumber = await calculateInvoiceNumber();
		let address = selectedContact.contact_address;
		let tsz = address.substring(address.indexOf(",") + 1);
		address = address.substring(0, address.indexOf(",") + 1);
		if (newInvoiceNumber === null) return;
		let invoiceInfo = {
			send_email: emailContact,
			invoice_number: newInvoiceNumber,
			invoice_taxed: hasSalesTax,
			invoice_credit: usingCreditCard,
			customer: {
				contact_id: selectedContact.contact_id,
				contact_name: selectedContact.contact_name,
				contact_email: selectedContact.contact_email,
				contact_phone: selectedContact.contact_phone,
				contact_address: address,
				contact_tsz: tsz,
			},
			containers: [],
		};
		for (const container of selectedContainers) {
			await markContainerSold(container, newInvoiceNumber);
			invoiceInfo.containers = [...invoiceInfo.containers, container];
		}
		postInvoice(invoiceInfo);
		setFinalInvoiceInfo(invoiceInfo);
		setGenerate(true);
	};

	const recieveFinalContainer = (updatedContainer) => {
		setSelectedContainers((prev) =>
			prev.map((container) => {
				return container.id === updatedContainer.id
					? updatedContainer
					: container;
			})
		);
	};

	const editSelectedContainers = (containers) => {
		setSelectedContainers(containers);
	};

	const recieveContact = (contact) => {
		if (selectedContact.contact_id === "null") {
			setSelectedContact(contact);
			return true;
		} else if (contact === "null") {
			setSelectedContact({ contact_id: "null" });
			return false;
		} else {
			setPopup(
				"ERROR Only one customer can be selected at a time, de-select the current customer and replace as you wish."
			);
			return false;
		}
	};
	// Take the most recent invoice number and check if year/month has changed,
	// if changed, reset the tail# to 001, else just increment the tail #
	const calculateInvoiceNumber = async () => {
		const latest = await getMostRecentInvoiceNumber();
		if (latest === null) return null;

		const date = new Date();
		let year = String(date.getFullYear());
		let month = String(date.getMonth() + 1);

		if (month.length === 1) month = "0" + month;

		if (String(latest).includes(year + month)) return latest + 1;
		else return parseInt(year + month + "001");
	};

	const getMostRecentInvoiceNumber = async () => {
		try {
			const res = await fetch(
				`http://localhost:8080/api/v2/invoice/latest`,
				{
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
				}
			);
			if (!res.ok) {
				setPopup("ERROR Could not fetch most recent invoice number.");
			}
			const data = await res.json();
			return data.latest;
		} catch (err) {
			setPopup("ERROR Could not fetch most recent invoice number");
			return null;
		}
	};

	const markContainerSold = async (container, invoice_number) => {
		fetch(`http://localhost:8080/api/v1/inventory/sold`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				id: container.id,
				destination: container.destination,
				sale_price: container.sale_price,
				release_number: invoice_number,
				trucking_rate: container.trucking_rate,
				modification_price: container.modification_price,
				invoice_notes: container.invoice_notes,
			}),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Couldn't add Container to sold");
				return;
			}
		});
		console.log(
			"MARKING " +
				container.unit_number +
				" SOLD FOR INVOICE #: " +
				invoice_number
		);
	};
	const postInvoice = (invoiceData) => {
		fetch(`http://localhost:8080/api/v2/invoice`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				containers: invoiceData.containers,
				invoice_number: invoiceData.invoice_number,
				contact_id: invoiceData.customer.contact_id,
				invoice_taxed: invoiceData.invoice_taxed,
			}),
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR could not add Invoice to Database");
					return;
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				console.log("DATA: ", data);
				setGenInvoiceID(data.id);
			});
	};
	return (
		<div className="invoiceCreatorWrapper">
			<h1 className="invHeader">
				{step}. {stepInstructions[step - 1]}
			</h1>
			<div className="directionBtns">
				<button
					className="addBtn"
					onClick={() =>
						step === 1 ? setStep(step) : setStep(step - 1)
					}
				>
					Back
				</button>
				<button
					className="addBtn"
					onClick={() => (step === 3 ? () => {} : setStep(step + 1))}
				>
					Next
				</button>
			</div>
			{/* display:none so state isn't lost */}
			<div className={step === 1 ? "" : "hidden"}>
				<SelectContainers
					sendSelectedContainers={editSelectedContainers}
				/>
			</div>
			<div className={step === 2 ? "" : "hidden"}>
				<SelectCustomer sendSelectedCustomer={recieveContact} />
			</div>
			<div className={step === 3 ? "step3Table" : "hidden step3Table"}>
				<table className="inventoryTable">
					<thead className="inventoryHeader">
						<th>Unit Number</th>
						<th>Size</th>
						<th>Sale Price</th>
						<th>Trucking Rate</th>
						<th>Modding Costs</th>
						<th>Line Description (If applicable)</th>
						<th>Destination</th>
					</thead>
					{/* In the case that there are no selected containers or missing customer data
					, send them back to the prior option */}
					{selectedContainers.length === 0 ||
					selectedContact.contact_id === "null" ? (
						<tr>
							<td
								colSpan={10}
								style={{
									textAlign: "center",
									fontWeight: "bold",
								}}
							>
								Missing Container or Customer, Check Selections
							</td>
						</tr>
					) : (
						selectedContainers.map((container) => {
							return (
								<ContainerInvoice
									container={container}
									sendFinalContainer={recieveFinalContainer}
								/>
							);
						})
					)}
				</table>
				{selectedContainers.length !== 0 &&
					selectedContact.contact_id !== "null" && (
						<div className="finalButtons">
							<div className="emailPrompt">
								{selectedContact.contact_email && (
									<>
										<label>
											Send email to{" "}
											<span className="bold">
												{selectedContact.contact_email}
											</span>
											?
										</label>

										<span className="checkboxLine invoiceCheck">
											<input
												type="checkbox"
												checked={emailContact}
												onChange={() =>
													setEmailContact(
														!emailContact
													)
												}
											></input>
										</span>
									</>
								)}
							</div>
							<div className="emailPrompt">
								<label>Sales Tax?</label>
								<span className="checkboxLine invoiceCheck">
									<input
										type="checkbox"
										checked={hasSalesTax}
										onChange={() =>
											setHasSalesTax(!hasSalesTax)
										}
									></input>
								</span>
							</div>
							<div className="emailPrompt">
								<label>Using Credit Card?</label>
								<span className="checkboxLine invoiceCheck">
									<input
										type="checkbox"
										checked={usingCreditCard}
										onChange={() =>
											setUsingCreditCard(!usingCreditCard)
										}
									></input>
								</span>
							</div>
							<button
								className="addBtn generateBtn"
								onClick={() => generateInvoice()}
							>
								Generate
							</button>
						</div>
					)}
				{generate && (
					<InvoiceForm invoiceID={genInvoiceID} sendEmail={true} />
				)}
			</div>
		</div>
	);
}

export default CreateInvoice;
