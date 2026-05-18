import React from "react";
import "../styles/legal.css";

const Privacy = () => {
	return (
		<div className="legalPage">
			<div className="legalSheet">
				<h1>Privacy Policy</h1>
				<p className="legalLastUpdated">Last updated: May 18, 2026</p>

				<p>
					This page describes how Airtight Container, a shipping-container yard
					located in Manalapan, NJ, handles personal information collected in
					the course of releasing containers to drivers at our yard.
				</p>

				<h2>Information we collect</h2>
				<p>
					When you pick up a container from our yard, our operator may ask you
					whether you would like a copy of your delivery sheet sent to your
					phone or email. If you say yes, we collect:
				</p>
				<ul>
					<li>Your name</li>
					<li>
						Your mobile phone number (only if you opt in to receive an SMS
						delivery receipt)
					</li>
					<li>
						Your email address (only if you opt in to receive an email
						delivery receipt)
					</li>
				</ul>

				<h2>What we use it for</h2>
				<p>
					The phone number and email address you provide are used solely to
					send you a single message containing a link to your delivery sheet
					for that specific pickup. We do not use that information for any
					other purpose.
				</p>

				<h2>What we do not do</h2>
				<ul>
					<li>We do not sell your information.</li>
					<li>We do not share your information with any third party.</li>
					<li>
						We do not retain your contact information for marketing
						purposes.
					</li>
					<li>
						We do not send recurring, promotional, or follow-up messages.
					</li>
				</ul>

				<h2>Opting out</h2>
				<p>
					You can opt out of SMS at any time by replying <strong>STOP</strong>
					{" "}to any message you receive from us. Once you opt out, you will
					not receive any further messages from us. You can also email us at
					the address below to request that we not contact you in the future.
				</p>

				<h2>Data retention</h2>
				<p>
					We retain delivery records for our own business records as required
					by tax and regulatory obligations. Contact information stored
					inside those records is not used for any communication beyond the
					single transactional delivery receipt for the pickup it relates to.
				</p>

				<h2>Contact</h2>
				<p>
					Questions about this policy can be sent to{" "}
					<a href="mailto:michelle@airtightstorage.com">
						michelle@airtightstorage.com
					</a>
					.
				</p>
			</div>
		</div>
	);
};

export default Privacy;
