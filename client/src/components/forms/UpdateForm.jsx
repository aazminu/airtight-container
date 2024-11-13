import React from 'react';
import { useState } from 'react';
import '../../styles/updateform.css';
function UpdateForm({ container, save, close }) {
  const [updatedContainer, setUpdatedContainer] = useState(container);

  const setUnitNumber = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      unit_number: e.target.value
    }));
  };
  const setSize = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      size: e.target.value
    }));
  };
  const setDamage = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      damage: e.target.value
    }));
  };
  const setTruckingCompany = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      trucking_company: e.target.value
    }));
  };
  const setAcceptanceNumber = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      acceptance_number: e.target.value
    }));
  };
  const setSaleCompany = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      sale_company: e.target.value
    }));
  };
  const setAquisitionPrice = (e) => {
    setUpdatedContainer((prev) => ({
      ...prev,
      aquisition_price: e.target.value
    }));
  };
  const submitForm = (e) => {
    e.preventDefault();
    save(updatedContainer);
  };

  return (
    <div className="update">
      <form onSubmit={submitForm}>
        <table>
          <tbody>
            <tr>
              <td>
                <span className="editSubTitle">Unit Number:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setUnitNumber}
                  value={updatedContainer.unit_number}
                  maxLength="12"></input>
              </td>
              <td>
                <span className="editSubTitle">Size:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setSize}
                  value={updatedContainer.size}
                  maxLength="5"></input>
              </td>
            </tr>
            <tr>
              <td>
                <span className="editSubTitle">Damage:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setDamage}
                  value={updatedContainer.damage}
                  maxLength="60"></input>
              </td>
              <td>
                <span className="editSubTitle">Trucking Company:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setTruckingCompany}
                  value={updatedContainer.trucking_company}
                  maxLength="40"></input>
              </td>
            </tr>
            <tr>
              <td>
                <span className="editSubTitle">Acceptance Number:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setAcceptanceNumber}
                  value={updatedContainer.acceptance_number}
                  maxLength="15"></input>
              </td>
              <td>
                <span className="editSubTitle">Sale Company:</span>
              </td>
              <td>
                {' '}
                <input
                  type="text"
                  onChange={setSaleCompany}
                  value={updatedContainer.sale_company}
                  maxLength="20"></input>
              </td>
            </tr>
            <tr>
              <td>
                <span className="editSubTitle">Aquisition Price:</span>
              </td>
              <td>
                <input
                  type="text"
                  onChange={setAquisitionPrice}
                  value={updatedContainer.aquisition_price}
                  maxLength="8"></input>
              </td>
              <td>
                <button type="button" className="editBtn" onClick={() => close()}>
                  CLOSE
                </button>
              </td>
              <td>
                <button type="submit" className="editBtn">
                  SAVE
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
}

export default UpdateForm;
