import React from "react";
import { useState } from "react";
function ContainerInvoice({ container, sendFinalContainer }) {
	const [finalContainer, setFinalContainer] = useState(container);

	const handleInputChange = (field) => (e) => {
		const updatedContainer = { ...finalContainer, [field]: e.target.value };
		setFinalContainer(updatedContainer);
		sendFinalContainer(updatedContainer);
	};

	return (
		<tr className="invoiceContainerRow">
			<td>{finalContainer.unit_number}</td>
			<td>{finalContainer.size}</td>
			<td>
				<input
					className="invoiceContainerNumberInput"
					type="text"
					onChange={handleInputChange("sale_price")}
					value={finalContainer.sale_price}
					maxLength="50"
				></input>
			</td>
			<td>
				<input
					className="invoiceContainerNumberInput"
					type="text"
					onChange={handleInputChange("trucking_rate")}
					value={finalContainer.trucking_rate}
					maxLength="50"
				></input>
			</td>
			<td>
				<input
					className="invoiceContainerNumberInput"
					type="text"
					onChange={handleInputChange("modification_price")}
					value={finalContainer.modification_price}
					maxLength="50"
				></input>
			</td>
			<td>
				<input
					type="text"
					className="invoiceContainerInput"
					onChange={handleInputChange("invoice_notes")}
					value={finalContainer.invoice_notes}
					maxLength="50"
				></input>
			</td>
			<td>
				<input
					type="text"
					className="invoiceContainerInput"
					onChange={handleInputChange("destination")}
					value={finalContainer.destination}
					maxLength="50"
				></input>
			</td>
		</tr>
	);
}

export default ContainerInvoice;
