import React from 'react'
import { useState, useContext } from 'react'
import {useNavigate} from 'react-router-dom'
import { render } from '@react-email/render'
import Invoice from '../templates/Invoice'

import { userContext } from '../../context/restaurantcontext'
function InvoiceForm({containerData, generate}) {
  const date = new Date();
  
  const { setPopup } = useContext(userContext)
  const navigate = useNavigate()
  const [invoiceInfo, setInvoiceInfo] = useState({
    address: "",
    tsz: "",
    name: "",
    email: "",
    cell: "",
  })
  const [toggleEmail, setToggle] = useState(true)
  const sendEmail = (sendMail) => {
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
          <p class='invSubHead'>Date: ${date.toDateString().substr(3)}</p>
          <p class="invSubHead">Invoice#: ${containerData[0].release_number}</p>
        </div>
        <div class="invAddresses">
          <span class='invAddress'>Airtight Storage Systems Inc<br/> 41 Wilson Avenue <br/> Manalapan, NJ 07726 <br/> 732-792-8111 <br/> michelle@airtightstorage.com</span>
          <p>TO</p>
          <span class='invAddress'> ${invoiceInfo.name} <br/> ${invoiceInfo.address} <br/> ${invoiceInfo.tsz} <br/> ${invoiceInfo.cell} <br/> ${invoiceInfo.email} </span>
        </div>
        <div class="deliverTo">
          <p>DELIVER TO: ${containerData[0].destination}</p>
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
                    <td class="allborder">+</td>
                  </tr>
                  <tr class="invTableRow noLeft">
                    <td colspan="3" class="spanItem bold">
                        Sales Tax
                    </td>
                    <td class="allborder"></td>
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

    let insertString = ""
    let total = 0;

    for (let i = 0; i < containerData.length; i++) {
      let itemizedRow = 
      `<tr class="invTableRow">
        <td>1</td>
        <td>${containerData[i].invoice_notes} ${containerData[i].unit_number}</td>
        <td>${containerData[i].sale_price}</td>
        <td>${containerData[i].sale_price}</td>
      </tr>
      <tr class="invTableRow">
          <td>1</td>
          <td>DELIVERY FEE TO ${containerData[i].destination}</td>
          <td></td>
          <td>${containerData[i].trucking_rate}</td>
      </tr>`;
      insertString = insertString.concat(itemizedRow) 
      total += parseInt(containerData[i].sale_price) + parseInt(containerData[i].trucking_rate)
    }

    invoiceHtml = invoiceHtml.replace('~', insertString)
    invoiceHtml = invoiceHtml.replaceAll('+', total)

    if(!sendMail){
      navigate('/reports/form', {state:{type:"invoice", container: containerData, details: invoiceInfo, html: invoiceHtml}})
      window.location.reload()
      return
    }

    fetch('/api/v1/send', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: 'hlynch02@tufts.edu',
        subject: 'Testing emails', 
        html: invoiceHtml,  
      }),
      credentials: 'include'
    }).then((res) => {
      if(!res.ok) setPopup("ERROR Failed to send")
      else{
        setPopup("Email sent!")
      }
    })

    navigate('/reports/form', {state:{type:"invoice", container: containerData, details: invoiceInfo, html: invoiceHtml}})
    window.location.reload()
  }
  const changeName = (e) => {
    setInvoiceInfo(prev=> ({
      ...prev, name: e.target.value,
    }))
  }
  const changeEmail = (e) => {
    setInvoiceInfo(prev=> ({
      ...prev, email: e.target.value,
    }))
  }
  const changeCell = (e) => {
    setInvoiceInfo(prev=> ({
      ...prev, cell: e.target.value,
    }))
  }
  const changeAddress = (e) => {
    setInvoiceInfo(prev=> ({
      ...prev, address: e.target.value,
    }))
  }
  const changeTSZ = (e) => {
    setInvoiceInfo(prev=> ({
      ...prev, tsz: e.target.value,
    }))
  }
  const generateInvoice = (e) => {
    e.preventDefault()
    if(toggleEmail) sendEmail(true)
    else{
      sendEmail(false)
    }
  }
  return (
    <div className='repForm'>
      <form onSubmit={generateInvoice}>
        <span><input type="text" value={invoiceInfo.name} onChange={changeName} placeholder='Name:'></input></span>
        <span><input type="text" value={invoiceInfo.email} onChange={changeEmail} placeholder='Email:'></input></span>
        <span><input type="text" value={invoiceInfo.cell} onChange={changeCell} placeholder='Phone Number:'></input></span>
        <span><input type="text" value={invoiceInfo.address} onChange={changeAddress} placeholder='Address:'></input></span>
        <span><input type="text" value={invoiceInfo.tsz} onChange={changeTSZ} placeholder='Town, State, Zipcode:'></input></span>
        <span className='checkboxLine'><label>Send Email Copy?<input type="checkbox" checked={toggleEmail} onChange={(e) => setToggle(e.target.checked)}></input></label></span>
        <span><button className='editBtn'>Generate</button></span>
      </form>
    </div>
  )
}

export default InvoiceForm