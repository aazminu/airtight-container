import React from "react";
import { useState } from "react";
import "../../styles/updateform.css";
function ContactForm({ contact, save, close }) {
	const [newContact, setNewContact] = useState(
		contact ?? {
			contact_name: "",
			contact_phone: "",
			contact_email: "",
			contact_address: "",
		}
	);

	const setContactName = (e) => {
		setNewContact((prev) => ({
			...prev,
			contact_name: e.target.value,
		}));
	};
	const setContactEmail = (e) => {
		setNewContact((prev) => ({
			...prev,
			contact_email: e.target.value,
		}));
	};
	const setContactPhone = (e) => {
		setNewContact((prev) => ({
			...prev,
			contact_phone: e.target.value,
		}));
	};
	const setContactAddress = (e) => {
		setNewContact((prev) => ({
			...prev,
			contact_address: e.target.value,
		}));
	};

	const submitForm = (e) => {
		e.preventDefault();
		save(newContact);
		close();
	};

	return (
		<div className="update addNewContact">
			<form onSubmit={submitForm}>
				<table className="inventoryTable ">
					<tbody>
						<tr>
							<td>
								<span className="editSubTitle">Name:</span>
							</td>
							<td>
								<input
									type="text"
									onChange={setContactName}
									value={newContact.contact_name}
									maxLength="50"
								></input>
							</td>
							<td>
								<span className="editSubTitle">Email:</span>
							</td>
							<td>
								<input
									type="email"
									onChange={setContactEmail}
									value={newContact.contact_email}
									maxLength="25"
								></input>
							</td>
						</tr>
						<tr>
							<td>
								<span className="editSubTitle">Phone:</span>
							</td>
							<td>
								<input
									type="phone"
									onChange={setContactPhone}
									value={newContact.contact_phone}
									maxLength="12"
								></input>
							</td>
							<td>
								<span className="editSubTitle">Address:</span>
							</td>
							<td>
								<input
									type="text"
									placeholder="# STREET, TOWN, STATE ZIP"
									onChange={setContactAddress}
									value={newContact.contact_address}
									maxLength="100"
								></input>
							</td>
						</tr>
						<tr>
							<td colSpan={2}>
								<button
									type="button"
									className="editBtn"
									onClick={() => close()}
								>
									CLOSE
								</button>
							</td>
							<td colSpan={2}>
								<button type="submit" className="editBtn">
									SAVE
								</button>
							</td>
						</tr>
					</tbody>
				</table>
			</form>
		</div>
	);
}

export default ContactForm;
