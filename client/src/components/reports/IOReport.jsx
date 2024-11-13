import React from 'react';
import { useState, useContext } from 'react';
import { render } from '@react-email/render';
import Template from '../templates/Template';
import { userContext } from '../../context/restaurantcontext';
function IOReport({ generate }) {
  const { setPopup } = useContext(userContext);
  const [visibleInput, setVisibleInput] = useState(false);
  const [customDate, setCustomDate] = useState();
  const listener = (e) => {
    const selectVal = e.target.value;
    if (selectVal === 'custom') {
      setVisibleInput(!visibleInput);
    } else {
      setVisibleInput(false);
    }
    console.log(selectVal);
  };
  const sendEmail = () => {
    const html = render(<Template />, {
      pretty: true
    });
    fetch('/api/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: 'hlynch02@tufts.edu',
        subject: 'Testing emails',
        html: html
      }),
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) setPopup('ERROR Unable to send');
    });
  };
  const submitForm = (e) => {
    e.preventDefault();
    //generate(formData)
  };
  const setDate = (e) => {
    setCustomDate(e.target.value);
  };
  return (
    <div className="repContainer ioContainer">
      {/* <button onClick={() => sendEmail()}>Email Please</button> */}
      <div className="card">
        <div className="reportTitle">Inbound/Outbound Report</div>
        <div className="reportDesc">
          <p>
            Generate a report with the details of all inbound and outbound containers within a set
            interval of dates.
          </p>
        </div>
        <form onSubmit={submitForm} method="post">
          <div className="dateInputs">
            <input type="date" className="obDate"></input> <span>to</span>{' '}
            <input type="date" className="obDate"></input>
          </div>
          {visibleInput && <input type="date" onChange={setDate}></input>}
          <button className="editBtn">Generate</button>
        </form>
      </div>
    </div>
  );
}

export default IOReport;
