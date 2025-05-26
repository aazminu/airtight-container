import React from "react";
import "../styles/reports.css";
import IOReport from "../components/reports/IOReport";
import DeliverySheet from "../components/reports/DeliverySheet";
function Reports() {
	return (
		<>
			<div className="head">
				<h1 className="invHeader">Reports</h1>
			</div>
			<div className="reportContainer">
				{/* <IOReport /> */}
				<DeliverySheet />
			</div>
		</>
	);
}

export default Reports;
