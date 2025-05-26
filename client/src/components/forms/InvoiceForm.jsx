import React from "react";
import { useEffect, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";

import { userContext } from "../../context/restaurantcontext";
function InvoiceForm({ invoiceID, sendEmail }) {
	const { setPopup } = useContext(userContext);
	const [invoiceData, setInvoiceData] = useState({});
	const navigate = useNavigate();

	useEffect(() => {
		console.log("FETCHING");
		fetch(`http://localhost:8080/api/v2/invoice/${invoiceID}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to get requested invoice");
					return;
				}
				return res.json();
			})
			.then((data) => {
				console.log(
					"DIRECT FROM FETCH: ",
					data.data.invoices[0].containers
				);
				setInvoiceData(data.data.invoices[0]);
			});
	}, [setPopup, invoiceID]);

	useEffect(() => {
		if (Object.keys(invoiceData).length > 0) {
			console.log("GENERATING");
			generateInvoice();
		}
	}, [invoiceData]);

	console.log("CREATING DATE OBJ");
	const date = new Date(invoiceData.invoice_date);

	const generateInvoice = () => {
		console.log("OBJ IN GEN FN:", invoiceData);
		// The following is one big template string which is styled to look like
		// the invoice.
		let invoiceHtml = `<!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
        <div class='invoice'>
        <div class='invTop'>
        <div class='invTitle'>
        <h1 class='invTitle'>INVOICE</h1>
        </div>
            <div class='invLogo'>
              |
            </div>
        </div>
        <div class="invDate">
          <p class='invSubHead'>Date: ${date.toDateString().substring(3)}</p>
          <p class="invSubHead">Invoice#: ${invoiceData.invoice_number}</p>
        </div>
        <div class="invAddresses">
          <span class='invAddress'>Airtight Storage Systems Inc<br/> 41 Wilson Avenue <br/> Manalapan, NJ 07726 <br/> 732-792-8111 <br/> michelle@airtightstorage.com</span>
          <p>TO</p>
          <span class='invAddress'> ${
				invoiceData.customer.contact_name
			} <br/> ${invoiceData.customer.contact_address.substring(
			0,
			invoiceData.customer.contact_address.indexOf(",") + 1
		)} <br/> ${invoiceData.customer.contact_address.substring(
			invoiceData.customer.contact_address.indexOf(",") + 1
		)} <br/> ${invoiceData.customer.contact_phone} <br/> ${
			invoiceData.customer.contact_email
		} </span>
        </div>
        <div class="deliverTo">
          <p>DELIVER TO: ${invoiceData.containers[0].destination}</p>
        </div>
        <div class="invTable">
          <table>
            <thead>
              <tr class="invTableRow">
                <td class="col1">SALESPERSON</td>
                <td class="col2">JOB</td>
                <td class="col3">PAYMENT TERMS</td>
                <td class="col4">DUE DATE</td>
              </tr>
            </thead>
            <tbody>
              <tr class="invTableRow finalRow">
                <td>Michelle</td>
                <td></td>
                <td>Due on receipt</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="invTable receiptTable">
            <table>
              <thead>
                <tr class="invTableRow">
                  <td class="col1">QTY</td>
                  <td class="col2">DESCRIPTION</td>
                  <td class="col3">UNIT PRICE</td>
                  <td class="col4">LINE TOTAL</td>
                </tr>
              </thead>
              <tbody>
                ~
                  <tr class="invTableRow finalRow">
                    <td></td>
                    <td class="bold centered">ALL SALES ARE FINAL NO REFUNDS OR EXCHANGES <br> OF ANY KIND</td>
                    <td></td>
                    <td></td>
                  </tr>
                  <tr class="invTableRow noLeft">
                    <td colspan="3" class="spanItem bold">
                        Subtotal
                    </td>
                    <td class="allborder">*</td>
                  </tr>
                  <tr class="invTableRow noLeft">
                    <td colspan="3" class="spanItem bold">
                        Sales Tax
                    </td>
                    <td class="allborder">^</td>
                  </tr>
                  <tr class="invTableRow noLeft">
                    <td colspan="3" class="spanItem bold">
                        3.5% Credit Card Fee
                    </td>
                    <td class="allborder">*</td>
                  </tr>
                  <tr class="invTableRow noLeft">
                    <td colspan="3" class="spanItem">
                        <span class="black bold">TOTAL</span>
                    </td>
                    <td class="allborder">+</td>
                  </tr>
              </tbody>
            </table>
        </div>
        <div class="footerContainer">
            <p class="invSubHead">Make all checks payable to <span class="bold">Airtight Storage Systems</span></p>
            <p class="blue bold">Thank you for your business!</p>
            <p class="blue bold">Like us on Facebook!</p>
        </div>
    </div>
</body>
<style>
    body{
        overflow: hidden;
        font-family: Arial, Helvetica, sans-serif;
    }
    .blue{
        color:#215868;
    }
    .finalRow td{
        border-bottom: 2px solid grey !important;
    }
    .spanItem{
        text-align: right;
        color:#215868;
    }
    .black{
        color: black !important;
    }
    .allborder{
        border: 1px solid grey;
    }
    .bold {
        font-weight: bold;
    }
    .centered{
        padding-top: 5% !important;
        font-size: 12px;
        text-align: center;
    }
    div.invoice{
        max-width:950px;
        max-height:1320px;
    }
    div.invTop{
        flex:1;
    }
    div.invTitle{
        float: left;
    }
    div.invLogo{
        width: 40%;
        float:right;
    }
    div.invDate{
        padding-top:20px;
        clear:left;
        float:left;
    }
    img.invLogo{
        width: 100%;
        height: 100%; 
        object-fit: contain;
    }
    p.invSubHead{
        color:gray;
    }
    h1.invTitle{
        color:#B8CCE4;
        font-size: 60px;
    }
    div.invAddresses{
        clear:left;
        float:left;
        display:flex;
        width:fit-content;
        padding-top:80px;
        padding-bottom: 30px;
    }
    span.invAddress{
        font-size:16px;
        padding-left:10px;
    }
    div.invAddresses > p {
        padding-right: 25px;
        padding-left: 25px;
        color:#2192CF;
    }
    div.deliverTo{
        clear:both;
    }
    div.deliverTo > p {
        background-color: yellow;
        width:fit-content;
        margin-inline:auto;
        font-weight:bold;
    }
    div.invTable{
        width: 100%;
    }
    div.invTable > table {
        width:100%;
        border: 1px solid gray;
        border-top: 2px solid gray;
        border-bottom: none;
        border-left: none;
        border-spacing: 0;
    }
    div.invTable > table > thead > tr{
        background-color:#DBE5F1;
        color: #215868;
        font-weight: bolder;
        text-align: center;
    }
    tr.invTableRow > td {
        border-left: 2px solid grey;
        border-right: 2px solid grey;
        padding: 5px;
        font-size:12px;
    }
    .noLeft td{
        border-left: none !important;
    }
    .receiptTable{
        padding-top: 15px;
    }
    .col1{
        width:15%;
    }
    .col2{
        width: 50%;
    }
    .col3{
        width: 15%;
    }
    .col4{
        width:15%
    }
    .footerContainer{
        padding-top: 3%;
        text-align: center;
    }
    .invTable tbody > tr > td{
      background-color: none !important;
    }
</style>
</html>
`;

		let insertString = "";
		let subTotal = 0;
		let total = 0;
		let salesTax = 0;
		let creditFee = 0;

		// Insert HTML directly into the form foreach container
		for (let i = 0; i < invoiceData.containers.length; i++) {
			let itemizedRow = `<tr class="invTableRow">
                                <td>1</td>
                                <td>${
									invoiceData.containers[i].invoice_notes ||
									""
								} ${invoiceData.containers[i].unit_number}</td>
                                <td>${invoiceData.containers[i].sale_price}</td>
                                <td>${invoiceData.containers[i].sale_price}</td>
                              </tr>
                              <tr class="invTableRow">
                                <td>1</td>
                                <td>DELIVERY FEE TO ${
									invoiceData.containers[i].destination
								}</td>
                                <td></td>
                                <td>${
									invoiceData.containers[i].trucking_rate
								}</td>
                              </tr>`;
			insertString = insertString.concat(itemizedRow);
			subTotal +=
				parseInt(invoiceData.containers[i].sale_price) +
				parseInt(invoiceData.containers[i].trucking_rate);
		}
		// Calculate totals based on tax/credit card fee
		// NOTE: Each of the replace chars ^, ~, *, + are placeholders
		if (invoiceData.invoice_taxed) salesTax = subTotal * 0.06625;

		if (invoiceData.invoice_credit) {
			creditFee = (subTotal + salesTax) * 0.035;
		}

		total = subTotal + salesTax + creditFee;
		invoiceHtml = invoiceHtml.replace("~", insertString);
		invoiceHtml = invoiceHtml.replace("*", subTotal.toFixed(2));
		invoiceHtml = invoiceHtml.replace("^", salesTax.toFixed(2));
		invoiceHtml = invoiceHtml.replace("*", creditFee.toFixed(2));
		invoiceHtml = invoiceHtml.replace("+", total.toFixed(2));

		// Conditionally send email
		if (sendEmail) {
			console.log("SENDING EMAIL");
			fetch("http://localhost:8080/api/v1/send", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					to: invoiceData.send_email
						? invoiceData.customer.contact_email
						: "michelle@airtightstorage.com",
					bcc: [
						"greg@airtightstorage.com",
						"michelle@airtightstorage.com",
						"vagabond7257@gmail.com",
						"hlynch02@tufts.edu",
					],
					subject: `INVOICE to ${
						invoiceData.customer.contact_name
					} : ${date.toDateString().substring(3)}`,
					html: invoiceHtml,
				}),
				credentials: "include",
			}).then((res) => {
				if (!res.ok) setPopup("ERROR Failed to send");
				else {
					setPopup("Email sent!");
				}
			});
		}

		// Display the form
		navigate("/reports/form", {
			state: {
				type: "invoice",
				container: invoiceData.containers,
				html: invoiceHtml,
			},
		});
		window.location.reload();
	};

	return <></>;
}

export default InvoiceForm;
