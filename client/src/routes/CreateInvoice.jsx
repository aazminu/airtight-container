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
	const [generate, setGenerate] = useState(-1);
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
		// PR 3.5: server picks the invoice number atomically. We post
		// the invoice first, get the assigned number back, then call
		// /sold for each container with that number as release_number.
		const invoiceInfo = {
			send_email: emailContact,
			invoice_taxed: hasSalesTax,
			invoice_credit: usingCreditCard,
			contact_id: selectedContact.contact_id,
			containers: selectedContainers,
		};
		const created = await postInvoice(invoiceInfo);
		if (!created) return;
		for (const container of selectedContainers) {
			await markContainerSold(container, created.invoice_number);
		}
		setTimeout(() => setGenerate(created.id), 0);
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
	const markContainerSold = async (container, invoice_number) => {
		fetch(`/api/v1/inventory/sold`, {
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

	const postInvoice = async (invoiceData) => {
		try {
			const res = await fetch(`/api/v2/invoice`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					containers: invoiceData.containers,
					contact_id: invoiceData.contact_id,
					invoice_taxed: invoiceData.invoice_taxed,
					invoice_credit: invoiceData.invoice_credit,
				}),
				credentials: "include",
			});
			if (!res.ok) {
				setPopup("ERROR Unable to save Invoice");
				return null;
			}
			const data = await res.json();
			return { id: data.id, invoice_number: data.invoice_number };
		} catch (err) {
			setPopup("ERROR Unable to save Invoice");
			return null;
		}
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
				{generate !== -1 && (
					<InvoiceForm invoiceID={generate} sendEmail={true} />
				)}
			</div>
		</div>
	);
}

export default CreateInvoice;
