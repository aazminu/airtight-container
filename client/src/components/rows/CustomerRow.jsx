import React from "react";
import { useState, useContext } from "react";
import edit from "../../assets/images/edit.png";
import ContactForm from "../forms/ContactForm";
import { userContext } from "../../context/restaurantcontext";

function CustomerRow({ customer, sendContactUpstream, sendSelected }) {
	const { setPopup } = useContext(userContext);
	const [contact, setContact] = useState(customer);
	const [showEdit, setShowEdit] = useState(false);
	const [selected, setSelected] = useState(false);
	const updateContact = (editedContact) => {
		fetch(
			`api/v2/contact/${editedContact.contact_id}`,
			{
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					editedContact,
				}),
				credentials: "include",
			}
		).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Unable to edit contact");
				return;
			}
			sendContactUpstream(editedContact);
			setContact(editedContact);
		});
	};

	const selectContact = () => {
		// undefined here represents a de-selection-- nulling the parent's selection
		var res = sendSelected(selected ? "null" : contact);
		setSelected(res);
	};
	return (
		<>
			<tr className={selected ? "selectedCustomer" : ""}>
				<td>{contact.contact_name}</td>
				<td>{contact.contact_phone}</td>

				<td>{contact.contact_email}</td>
				<td>{contact.contact_address}</td>
				<td className="placeholderRow">
					<button className="addBtn" onClick={selectContact}>
						Select
					</button>
				</td>
				<td>
					<button
						className="editBtn"
						onClick={() => setShowEdit(!showEdit)}
					>
						<img src={edit} alt="Edit Unit" width="20px" />
					</button>
				</td>
			</tr>
			{showEdit && (
				<tr>
					<td colSpan={10}>
						<ContactForm
							contact={contact}
							save={updateContact}
							close={() => setShowEdit(!showEdit)}
						/>
					</td>
				</tr>
			)}
		</>
	);
}

export default CustomerRow;
