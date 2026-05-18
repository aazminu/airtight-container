import React from "react";
import { useParams } from "react-router-dom";
import "../styles/legal.css";

// Public-facing receipt link route used as a sample target for the SMS
// campaign-registration reviewer. Only the literal "sample" token (and a
// couple of demo aliases) render a placeholder delivery sheet; anything
// else returns the "expired or revoked" page so the URL pattern is
// resolvable without exposing arbitrary content.
//
// Real per-pickup receipt links are wired in a later phase (see PLAN.md
// PR 9.6) and live alongside this stub.
const DEMO_TOKENS = new Set(["sample", "demo", "preview"]);

const SampleReceipt = () => {
	const { token } = useParams();
	const isDemo = token && DEMO_TOKENS.has(token.toLowerCase());

	if (!isDemo) {
		return (
			<div className="legalPage">
				<div className="legalSheet">
					<h1>Receipt not available</h1>
					<p>
						This delivery-receipt link is no longer valid. Links expire 30
						days after issue and can also be revoked by the yard operator if
						a number was entered incorrectly.
					</p>
					<p>
						If you were expecting a receipt and reached this page, please
						email{" "}
						<a href="mailto:michelle@airtightstorage.com">
							michelle@airtightstorage.com
						</a>
						{" "}with your container number and we will resend it.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="legalPage">
			<div className="receiptSheet">
				<div className="receiptWatermark">SAMPLE</div>
				<header className="receiptHeader">
					<div>
						<div className="receiptBrand">Airtight Container</div>
						<div className="receiptTagline">Manalapan, NJ</div>
					</div>
					<div className="receiptDocTitle">DELIVERY SHEET</div>
				</header>

				<section className="receiptMeta">
					<div>
						<div className="receiptLabel">Date</div>
						<div className="receiptValue">May 18, 2026</div>
					</div>
					<div>
						<div className="receiptLabel">Sheet No.</div>
						<div className="receiptValue">SAMPLE-0001</div>
					</div>
					<div>
						<div className="receiptLabel">Driver</div>
						<div className="receiptValue">John Smith</div>
					</div>
				</section>

				<section className="receiptContainer">
					<div className="receiptLabel">Container</div>
					<div className="receiptUnitNumber">TRHU2174232</div>
					<div className="receiptContainerLine">
						20'DV · Wind &amp; Water Tight
					</div>
				</section>

				<section className="receiptDeliverTo">
					<div className="receiptLabel">Deliver to</div>
					<div className="receiptValue">123 Sample St, Long Branch, NJ 07740</div>
				</section>

				<section className="receiptSignatures">
					<div className="receiptSigBlock">
						<div className="receiptSigLine"></div>
						<div className="receiptLabel">Driver signature</div>
					</div>
					<div className="receiptSigBlock">
						<div className="receiptSigLine"></div>
						<div className="receiptLabel">Yard operator</div>
					</div>
				</section>

				<footer className="receiptFooter">
					This is a sample delivery sheet for demonstration purposes only.
					Real receipts are issued by the yard operator at the time of pickup.
				</footer>
			</div>
		</div>
	);
};

export default SampleReceipt;
