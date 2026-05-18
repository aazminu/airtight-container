import React from "react";
import "../styles/legal.css";

const Terms = () => {
	return (
		<div className="legalPage">
			<div className="legalSheet">
				<h1>Terms of Service</h1>
				<p className="legalLastUpdated">Last updated: May 18, 2026</p>

				<p>
					These terms govern your use of the delivery-receipt messaging
					service offered by Airtight Container, a shipping-container yard
					located in Manalapan, NJ.
				</p>

				<h2>The service</h2>
				<p>
					When you pick up a container from our yard and consent at the time
					of pickup, we send one transactional SMS or email containing a link
					to your delivery sheet for that specific pickup.
				</p>

				<h2>Consent</h2>
				<p>
					By providing your phone number or email address to our operator at
					the moment of pickup, you consent to receive a single delivery
					receipt for that pickup. Consent applies only to that one
					transaction; future pickups require a new consent.
				</p>

				<h2>Message frequency</h2>
				<p>
					You will receive at most one (1) SMS per pickup. We do not send
					recurring, promotional, or marketing messages.
				</p>

				<h2>Message and data rates</h2>
				<p>
					Standard message and data rates from your wireless carrier may
					apply. Airtight Container does not charge any fee for sending or
					receiving these messages.
				</p>

				<h2>Opting out</h2>
				<p>
					You can opt out at any time by replying <strong>STOP</strong> to
					any SMS message. You can also email us at the address below to
					request we not message you in the future.
				</p>

				<h2>Getting help</h2>
				<p>
					Reply <strong>HELP</strong> to any SMS message, or email{" "}
					<a href="mailto:michelle@airtightstorage.com">
						michelle@airtightstorage.com
					</a>
					{" "}for assistance.
				</p>

				<h2>Changes to these terms</h2>
				<p>
					We may update these terms occasionally. The current version is
					always available at{" "}
					<a href="https://airtightshippingcontainer.com/terms">
						airtightshippingcontainer.com/terms
					</a>
					.
				</p>
			</div>
		</div>
	);
};

export default Terms;
