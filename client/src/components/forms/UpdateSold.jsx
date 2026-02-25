import React from "react";
import { useState } from "react";

function UpdateSold({ container, save, close }) {
	const [updatedContainer, setUpdatedContainer] = useState(container);

	const set = (key) => (e) =>
		setUpdatedContainer((prev) => ({ ...prev, [key]: e.target.value }));

	const setDate = (e) => {
		setUpdatedContainer((prev) => ({
			...prev,
			outbound_date: e.target.value.concat(":00"),
		}));
	};

	const submitForm = (e) => {
		e.preventDefault();
		save(updatedContainer);
	};

	return (
		<div className="updatePanel">
			<form onSubmit={submitForm}>
				<div className="updateGrid">
					<div className="updateField">
						<label className="updateLabel">Trucker</label>
						<input
							type="text"
							className="updateInput"
							onChange={set("outbound_trucker")}
							value={updatedContainer.outbound_trucker || ""}
							maxLength="5"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Destination</label>
						<input
							type="text"
							className="updateInput"
							onChange={set("destination")}
							value={updatedContainer.destination || ""}
							maxLength="60"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Trucking Rate</label>
						<input
							type="text"
							className="updateInput"
							onChange={set("trucking_rate")}
							value={updatedContainer.trucking_rate || ""}
							maxLength="40"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Modification Costs</label>
						<input
							type="text"
							className="updateInput"
							onChange={set("modification_price")}
							value={updatedContainer.modification_price || ""}
							maxLength="15"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Sale Price</label>
						<input
							type="text"
							className="updateInput"
							onChange={set("sale_price")}
							value={updatedContainer.sale_price || ""}
							maxLength="20"
						/>
					</div>
					<div className="updateField">
						<label className="updateLabel">Outbound Date</label>
						<input
							type="datetime-local"
							className="updateInput"
							onChange={setDate}
							value={
								updatedContainer.outbound_date
									? updatedContainer.outbound_date
									: "2024-01-01T00:00:00"
							}
						/>
					</div>
				</div>
				<div className="updateActions">
					<button type="button" className="drawerBtn" onClick={() => close()}>
						Cancel
					</button>
					<button type="submit" className="drawerBtn drawerBtnPrimary">
						Save Changes
					</button>
				</div>
			</form>
		</div>
	);
}

export default UpdateSold;
