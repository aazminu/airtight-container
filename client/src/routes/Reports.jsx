import React from "react";
import "../styles/reports.css";
import DeliverySheet from "../components/reports/DeliverySheet";
function Reports() {
	return (
		<>
			<div className="head">
				<h1 className="invHeader">Reports</h1>
			</div>
			<div className="reportContainer">
				<DeliverySheet />
			</div>
		</>
	);
}

export default Reports;
