import React from 'react';
import { useState } from 'react';
import '../../styles/updateform.css';

function UpdateForm({ container, save, close }) {
  const [updatedContainer, setUpdatedContainer] = useState(container);

  const set = (key) => (e) =>
    setUpdatedContainer((prev) => ({ ...prev, [key]: e.target.value }));

  const submitForm = (e) => {
    e.preventDefault();
    save(updatedContainer);
  };

  return (
    <div className="updatePanel">
      <form onSubmit={submitForm}>
        <div className="updateGrid">
          <div className="updateField">
            <label className="updateLabel">Unit Number</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('unit_number')}
              value={updatedContainer.unit_number}
              maxLength="12"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Size</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('size')}
              value={updatedContainer.size}
              maxLength="5"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Damage</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('damage')}
              value={updatedContainer.damage || ''}
              maxLength="60"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Trucking Company</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('trucking_company')}
              value={updatedContainer.trucking_company || ''}
              maxLength="40"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Acceptance Number</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('acceptance_number')}
              value={updatedContainer.acceptance_number || ''}
              maxLength="15"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Sale Company</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('sale_company')}
              value={updatedContainer.sale_company || ''}
              maxLength="20"
            />
          </div>
          <div className="updateField">
            <label className="updateLabel">Acquisition Price</label>
            <input
              type="text"
              className="updateInput"
              onChange={set('aquisition_price')}
              value={updatedContainer.aquisition_price || ''}
              maxLength="8"
            />
          </div>
        </div>
        <div className="updateActions">
          <button type="button" className="drawerBtn" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="drawerBtn drawerBtnPrimary">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

export default UpdateForm;
