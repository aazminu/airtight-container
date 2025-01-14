import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";
import SearchContainers from "../SearchContainers";
import ContactForm from "./ContactForm";
import CustomerRow from "../rows/CustomerRow";

function SelectCustomer({ sendSelectedCustomer }) {
	const { setPopup } = useContext(userContext);
	const [filters, setFilters] = useState([]);
	const [customers, setCustomers] = useState([]);
	const [addNew, setAddNew] = useState(false);
	useEffect(() => {
		fetch(`/api/v2/contact`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Could not get available containers");
					return;
				}
				return res.json();
			})
			.then((data) => {
				console.log(data.data.contacts);
				setCustomers(data.data.contacts);
			});
	}, [setPopup]);

	const searchContainers = (value) => {
		if (value === "") {
			setFilters([]);
			return;
		}
		var filterHolder = [];
		for (let i = 0; i < customers.length; i++) {
			if (
				!JSON.stringify(customers[i])
					.toLowerCase()
					.includes(value.toLowerCase())
			) {
				filterHolder.push(customers[i].id);
			}
		}
		setFilters(filterHolder);
		filterHolder = [];
		console.log(customers);
	};

	const saveCustomer = (customer) => {
		fetch(`/api/v2/contact`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				customer,
			}),
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to add contact.");
					return;
				}
				return res.json();
			})
			.then((data) => {
				setCustomers((prevItems) => [...prevItems, data.contact]);
			});
	};

	const recieveContact = (editedContact) => {
		setCustomers((prev) =>
			prev.map((contact) => {
				return contact.contact_id === editedContact.contact_id
					? { ...contact, ...editedContact }
					: contact;
			})
		);
	};

	const sendContact = (contact) => {
		return sendSelectedCustomer(contact);
	};
	return (
		<div className="invoiceCreatorWrapper searchComponent">
			<SearchContainers search={searchContainers} />
			<div className="selectorTable searchComponent">
				<table className="inventoryTable">
					<thead>
						<tr className="inventoryHeader searchTable">
							<th>Name</th>
							<th>Phone #</th>
							<th>Email Address</th>
							<th>Address</th>
							<th>Select</th>
							<th>Edit</th>
						</tr>
					</thead>
					<tbody>
						{filters.length > 0
							? customers.map((customer) => {
									console.log("Filtering");
									return (
										!filters.includes(customer.id) && (
											<CustomerRow
												customer={customer}
												sendContactUpstream={
													recieveContact
												}
												sendSelected={sendContact}
											/>
										)
									);
							  })
							: customers.map((customer) => {
									return (
										<CustomerRow
											customer={customer}
											sendContactUpstream={recieveContact}
											sendSelected={sendContact}
										/>
									);
							  })}
					</tbody>
				</table>
			</div>
			<button
				className="addBtn directionBtns footerBtn"
				onClick={() => setAddNew(!addNew)}
			>
				Add New Customer
			</button>
			{addNew && (
				<ContactForm
					save={saveCustomer}
					close={() => setAddNew(!addNew)}
				/>
			)}
		</div>
	);
}

export default SelectCustomer;
