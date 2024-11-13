import React from 'react';
import logo from '../../assets/images/airtightfixed.png';
import '../../styles/deliverysheet.css';
function Delivery({ state }) {
  const container = state.container;
  const details = state.details;
  const date = new Date(details.date);
  return (
    <div className="printout">
      <div className="header">
        <h1 className="topper">
          <span className="title">AIRTIGHT CONTAINER</span>
          <br /> 41 WILSON AVENUE
          <br /> MANALAPAN, NJ 07726
          <br /> PHONE 732-792-8111
          <br /> FAX 732-792-8111
        </h1>
      </div>
      <div className="logo">
        <img src={logo} alt="logo" width="250px"></img>
      </div>
      <div className="areadiv">
        <p className="area">
          <br></br>
          <span className="bold">DELIVERY RECIEPT:</span> {container.invoice_notes}
          <br />
          <span className="bold">DAY & TIME</span>:{' '}
          {date.toString().slice(0, date.toString().indexOf('GMT'))}
          <br />
          <span className="bold">DELIVERY COMPANY</span>: {container.trucking_company}
          <br />
          <span className="bold">DELIVERY RECIEPT:</span> 1 {container.size.substr(0, 3)} Weather
          Tight Container
          <br />
          <span className="bold">RELEASE NUMBER:</span> {container.release_number}
          <br />
          <br />
          <span className="outer">
            <span className="bold">PICKUP LOCATION:</span>{' '}
            <span className="address">
              Airtight Storage <br /> 41 Wilson Avenue <br /> Manalapan, NJ 07726
            </span>
            <br />
            <span className="bold">DELIVERED TO:</span>{' '}
            <span className="address">
              {details.cust_name} <br /> {details.cust_address} <br /> {details.cust_tsz}
            </span>
            <br />
          </span>
          <br />
          <span className="bold">CONTACT ON SITE:</span> {details.contact} <br />
          <span className="bold">DOOR ORIENTATION: </span> {details.orientation} <br />
          <span className="bold">PAYMENT PICK UP DETAILS: </span> {details.pickup} <br />
          <span className="bold">CONTAINER #: </span> {container.unit_number} <br />
          <br />
          ** CONTAINER WAS RECIEVED IN GOOD WORKING ORDER PER <br /> SPECIFICATIONS AT THE TIME OF
          DELIVERY
          <br />
          <br />
          BY: _____________________________________________ <br />
          <br />
          SIGNATURE: _____________________________________________ DATE: ___________________ <br />
          <br />
          PRINT NAME: ____________________________________________ DATE: ___________________
        </p>
      </div>
    </div>
  );
}

export default Delivery;
