import React from "react";
import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { userContext } from "../../context/restaurantcontext";
function DeliverySheet() {
	const { setPopup } = useContext(userContext);
	const navigate = useNavigate();
	const [boxes, setBoxes] = useState([]);
	const [contacts, setContacts] = useState([]);
	const [selection, setSelection] = useState("");
	const initialCustomerDetails = {
		contact_name: "",
		contact_address: "",
		contact_tsz: "",
		orientation: "",
		onsite_contact: "",
		payment_details: "",
		delivery_date: "",
		trucking_company: "",
	};
	const [details, setDetails] = useState(initialCustomerDetails);

	const updateCustomerInfo = (e) => {
		if (e.target.value === "") return;
		const contact = contacts.find((entry) => {
			return entry.contact_id === Number(e.target.value);
		});

		let address = contact.contact_address;
		let tsz = address.substring(address.indexOf(",") + 1);
		address = address.substring(0, address.indexOf(",") + 1);

		setDetails((current) => ({
			...current,
			contact_name: contact.contact_name,
			contact_address: address,
			contact_tsz: tsz,
		}));
	};

	useEffect(() => {
		fetch("api/v1/inventory/sold", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to get inventory");
					return undefined;
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				console.log("BOXES", data.data.inventory);
				setBoxes(data.data.inventory);
				setSelection(data.data.inventory[0].unit_number);
			});

		fetch(`api/v2/contact`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("");
					return;
				}
				return res.json();
			})
			.then((data) => {
				setContacts(data.data.contacts);
			});
	}, [setPopup]);

	const updateSoldContainers = async (
		id,
		outbound_trucker,
		outbound_date
	) => {
		fetch(
			`api/v1/inventory/sold/deliverysheet/${id}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					outbound_trucker: outbound_trucker,
					outbound_date: outbound_date,
				}),
				credentials: "include",
			}
		).then((res) => {
			if (!res.ok) {
				setPopup(
					"ERROR Could not update sold information on container"
				);
			}
		});
	};

	const submitForm = async (e) => {
		e.preventDefault();

		let container = boxes.find((option) => {
			return option.unit_number === selection;
		});
		await updateSoldContainers(
			container.inventory_id,
			details.trucking_company,
			details.delivery_date
		);
		console.log(details);
		console.log(container);

		navigate("/reports/form", {
			state: { type: "delivery", container: container, details: details },
		});

		window.location.reload();
	};

	const updateFields = (field) => (e) => {
		setDetails((current) => ({
			...current,
			[field]: e.target.value,
		}));
	};
	return (
		<div className="repContainer">
			<div className="card">
				<div className="reportTitle">Produce Delivery Sheet</div>
				<div className="reportDesc">
					<p>
						Generate a delivery sheet for a sold box selected below.
					</p>
				</div>
				<div className="dSheetForm">
					<form onSubmit={submitForm} className="repForm">
						<label className="unitSelect">
							<span className="bold">Unit Number: </span>
							<select
								defaultValue={""}
								onChange={(e) => setSelection(e.target.value)}
								className="repSelect deliverySelect"
							>
								{boxes.map((option) => {
									return (
										<option value={option.unit_number}>
											{option.unit_number}
										</option>
									);
								})}
							</select>
						</label>
						<label>
							<span className="bold">Customer: </span>
							<select
								defaultValue={""}
								onChange={updateCustomerInfo}
								className="repSelect deliverySelect"
							>
								<option value={""}>None Selected</option>
								{contacts.map((option) => {
									return (
										<option value={option.contact_id}>
											{option.contact_name}
										</option>
									);
								})}
							</select>
						</label>
						<p>
							Customer Info:{" "}
							<span className="bold">
								NOTE: Auto-Filled Address MAY NOT BE Delivery
								Address
							</span>
						</p>
						<div className="formInputs">
							<div className="repRow">
								<span>
									<input
										type="text"
										value={details.contact_name}
										onChange={updateFields("contact_name")}
										placeholder="Name:"
									></input>
								</span>
								<span>
									<input
										type="text"
										value={details.contact_address}
										onChange={updateFields(
											"contact_address"
										)}
										placeholder="Address:"
									></input>
								</span>
							</div>
							<div className="repRow">
								<span>
									<input
										type="text"
										value={details.contact_tsz}
										onChange={updateFields("contact_tsz")}
										placeholder="Town, State, Zipcode:"
									></input>
								</span>
								<span>
									<input
										type="text"
										value={details.onsite_contact}
										onChange={updateFields(
											"onsite_contact"
										)}
										placeholder="Onsite Contact:"
									></input>
								</span>
							</div>
							<div className="repRow">
								<span>
									<input
										type="text"
										value={details.orientation}
										onChange={updateFields("orientation")}
										placeholder="Container Orientation:"
									></input>
								</span>
								<span>
									<input
										type="text"
										value={details.payment_details}
										onChange={updateFields(
											"payment_details"
										)}
										placeholder="Payment Details:"
									></input>
								</span>
							</div>
							<div className="truckingRow">
								<span>
									<input
										type="text"
										value={details.trucking_company}
										onChange={updateFields(
											"trucking_company"
										)}
										placeholder="Trucking Company:"
									></input>
								</span>
							</div>
							<div className="repRow delivDateRow">
								<label>Delivery Date:</label>{" "}
								<input
									type="datetime-local"
									className="obDate delivDate"
									value={details.delivery_date}
									onChange={updateFields("delivery_date")}
								></input>
							</div>
							<button className="editBtn">Generate</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}

export default DeliverySheet;
