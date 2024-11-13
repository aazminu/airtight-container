import React from 'react';
import { useState, useContext } from 'react';
import { userContext } from '../../context/restaurantcontext';
function AddForm() {
  const { setPopup } = useContext(userContext);
  const [newContainer, setNewContainer] = useState({
    id: 0,
    date: '',
    unit_number: '',
    size: '',
    damage: '',
    trucking_company: '',
    acceptance_number: '',
    sale_company: '',
    aquisition_price: '',
    state: 'available',
    notes: ''
  });
  const setUnitNumber = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      unit_number: e.target.value
    }));
  };
  const setSize = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      size: e.target.value
    }));
  };
  const setDamage = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      damage: e.target.value
    }));
  };
  const setTruckingCompany = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      trucking_company: e.target.value
    }));
  };
  const setAcceptanceNumber = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      acceptance_number: e.target.value
    }));
  };
  const setSaleCompany = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      sale_company: e.target.value
    }));
  };
  const setAquisitionPrice = (e) => {
    setNewContainer((prev) => ({
      ...prev,
      aquisition_price: e.target.value
    }));
  };
  const submitForm = (e) => {
    e.preventDefault();
    console.log('submitting and posting allegedly');
    addContainer(newContainer);
  };

  const addContainer = (container) => {
    fetch('/api/v1/inventory/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(container),
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) {
          console.log('error');
          setPopup('ERROR Improper Request: Ensure all fields are filled');
        }
        return res.json();
      })
      .then((data) => {
        setPopup('Container successfully added');
      });
  };

  return (
    <div className="addTableContainer">
      <form onSubmit={submitForm}>
        <table className="addTable">
          <thead>
            <tr className="inventoryHeader">
              <th>Add A Container:</th>
            </tr>
          </thead>
          <tbody className="inventoryBody">
            <tr>
              <td className="editSubTitle">Unit Number:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setUnitNumber}
                  value={newContainer.unit_number}
                  maxLength="12"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Size:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setSize}
                  value={newContainer.size}
                  maxLength="5"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Damage:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setDamage}
                  value={newContainer.damage}
                  maxLength="60"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Trucking Company:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setTruckingCompany}
                  value={newContainer.trucking_company}
                  maxLength="40"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Acceptance Number:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setAcceptanceNumber}
                  value={newContainer.acceptance_number}
                  maxLength="15"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Sale Company:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setSaleCompany}
                  value={newContainer.sale_company}
                  maxLength="20"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Aquisition Price:</td>
            </tr>
            <tr>
              <td>
                <input
                  type="text"
                  onChange={setAquisitionPrice}
                  value={newContainer.aquisition_price}
                  maxLength="20"></input>
              </td>
            </tr>
            <tr>
              <td className="editSubTitle">Images:</td>
            </tr>
            {/* <tr><input type="file" capture="environment" multiple="true"></input></tr> */}
            <tr>
              <td>
                <button value="Add Container" className="editBtn">
                  ADD CONTAINER
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  );
}

export default AddForm;
