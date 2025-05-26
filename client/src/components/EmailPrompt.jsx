import React from "react";
import "../styles/popup.css";
import exit from "../assets/images/exithover.png";
function EmailPrompt({ setSendEmail }) {
	return (
		<div className="popupContainer">
			<div className="emailPopup popup">
				<img
					className="cancelBtn"
					src={exit}
					alt={"Cancel Button"}
					onClick={() => setSendEmail("CANCEL")}
				></img>
				<p className="popupTitle">Email Regenerated Invoice?</p>
				<p className="error">
					Would you like to send this regenerated invoice as an email?
					<br />
					(Have you made changes not in the original record)
				</p>
				<button
					className="addBtn popupEmailBtn"
					onClick={() => setSendEmail(true)}
				>
					Yes, send email.
				</button>
				<button
					className="addBtn popupEmailBtn"
					onClick={() => setSendEmail(false)}
				>
					No, do not send.
				</button>
			</div>
		</div>
	);
}

export default EmailPrompt;
