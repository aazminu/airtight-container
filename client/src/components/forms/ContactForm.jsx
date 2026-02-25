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

	const set = (key) => (e) =>
		setNewContact((prev) => ({ ...prev, [key]: e.target.value }));

	const submitForm = (e) => {
		e.preventDefault();
		save(newContact);
		close();
	};

	return (
		<div className="updatePanel">
			<form onSubmit={submitForm}>
				<div className="updateGrid">
					<div className="updateField">
						<label className="updateLabel">Name</label>
						<input
							className="updateInput"
							type="text"
							onChange={set("contact_name")}
							value={newContact.contact_name}
							maxLength="50"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Email</label>
						<input
							className="updateInput"
							type="email"
							onChange={set("contact_email")}
							value={newContact.contact_email}
							maxLength="25"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Phone</label>
						<input
							className="updateInput"
							type="tel"
							onChange={set("contact_phone")}
							value={newContact.contact_phone}
							maxLength="12"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Address</label>
						<input
							className="updateInput"
							type="text"
							placeholder="# STREET, TOWN, STATE ZIP"
							onChange={set("contact_address")}
							value={newContact.contact_address}
							maxLength="100"
						/>
					</div>
				</div>
				<div className="updateActions">
					<button type="button" className="drawerBtn" onClick={close}>
						Cancel
					</button>
					<button type="submit" className="drawerBtn drawerBtnPrimary">
						Save Contact
					</button>
				</div>
			</form>
		</div>
	);
}

export default ContactForm;
