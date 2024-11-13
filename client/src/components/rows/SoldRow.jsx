import React from 'react';
import { useState, useEffect, useContext } from 'react';
import UpdateSold from '../forms/UpdateSold';
import redDot from '../../assets/images/reddot.png';
import edit from '../../assets/images/edit.png';
import outboundIcon from '../../assets/images/outbound.png';
import trash from '../../assets/images/delete.png';
import { userContext } from '../../context/restaurantcontext';
function SoldRow({ container, onDelete, outbound }) {
  const { setPopup } = useContext(userContext);
  const date = new Date();
  const offset = date.getTimezoneOffset() / 60;
  const [currentContainer, setCurrentContainer] = useState(container);
  const [outboundTime, setOutboundTime] = useState('');
  const [invTime, setInvTime] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  useEffect(() => {
    console.log('DATE' + currentContainer.outbound_date);
    var containerTime = currentContainer.outbound_date.substr(11, 8);
    var hour = 0;
    for (var i = 0; i < containerTime.length; i++) {
      var char = containerTime.charAt(i);
      if (char === ':') {
        break;
      } else {
        if (i === 0) hour += Number(char) * 10;
        else hour += Number(char);
      }
    }
    hour -= offset;
    if (hour < 0) hour += 24;
    setInvTime(hour.toString() + containerTime.substr(2, 6));
  }, [currentContainer.outbound_date, offset, showEdit]);
  useEffect(() => {
    var containerTime = currentContainer.sold_date.substr(11, 8);
    var hour = 0;
    for (var i = 0; i < containerTime.length; i++) {
      var char = containerTime.charAt(i);
      if (char === ':') {
        break;
      } else {
        if (i === 0) hour += Number(char) * 10;
        else hour += Number(char);
      }
    }
    hour -= offset;
    if (hour < 0) hour += 24;
    setOutboundTime(hour.toString() + containerTime.substr(2, 6));
  }, [currentContainer.sold_date, offset]);
  const updateNotes = (e) => {
    setCurrentContainer((prev) => ({
      ...prev,
      invoice_notes: e.target.value
    }));
  };
  const postNotes = () => {
    console.log(currentContainer.invoice_notes);
    console.log('Notes^');
    fetch(`/api/v1/inventory/sold/notes/${currentContainer.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        invoice_notes: currentContainer.invoice_notes
      }),
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) {
          console.log('err');
        }
        return res.json();
      })
      .then((data) => {
        console.log(data.data.inventory);
      });
  };
  const saveEdits = (updatedContainer) => {
    console.log('saving');
    fetch(`/api/v1/inventory/sold/${updatedContainer.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedContainer),
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) {
        setPopup('ERROR Failed to edit container');
      } else {
        setCurrentContainer(updatedContainer);
        setShowEdit(!showEdit);
      }
      return res.json();
    });
  };

  const markOutbound = () => {
    if (currentContainer.state === 'outbound') {
      setPopup('ERROR Container already marked as outbound');
      return;
    }
    const confirm = window.confirm('Are you sure you want to mark this container as outbound?');
    if (!confirm) return;
    fetch(`/api/v1/inventory/state/${currentContainer.inventory_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state: 'outbound'
      }),
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) {
        setPopup('ERROR Conversion Unsuccessful');
        return;
      }
    });
    fetch(`/api/v1/inventory/outbound/${currentContainer.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) {
          setPopup('ERROR Unable to mark outbound');
          return undefined;
        } else {
          setPopup('Converted to outbound.');
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setCurrentContainer((prev) => ({
          ...prev,
          outbound_date: data.data.inventory[0].outbound_date,
          state: 'outbound'
        }));
      });
    outbound(currentContainer.id);
  };
  const closeEdit = () => {
    setShowEdit(!showEdit);
  };
  return (
    <>
      <tr key={currentContainer.id}>
        <td>{currentContainer.id}</td>
        <td className="dateRow">
          {currentContainer.sold_date.substr(0, 10)}
          <br />
          {outboundTime}
        </td>
        <td className="dateRow">
          {currentContainer.outbound_date.substr(0, 10)} <br />
          {invTime}
        </td>
        <td>{currentContainer.release_number}</td>
        <td>{currentContainer.unit_number}</td>
        <td>{currentContainer.size}</td>
        <td>{currentContainer.outbound_trucker}</td>
        <td>{currentContainer.destination}</td>
        <td>{currentContainer.trucking_rate ? `$${currentContainer.trucking_rate}` : 'N/A'}</td>
        <td>{`$${currentContainer.modification_price}`}</td>
        <td>{currentContainer.sale_price ? `$${currentContainer.sale_price}` : 'N/A'}</td>
        <td colSpan={3}>
          <input
            type="text"
            value={currentContainer.invoice_notes}
            onChange={updateNotes}
            onBlur={postNotes}></input>
        </td>
        <td>
          <button className="tableBtn" onClick={() => setShowEdit(!showEdit)}>
            <img src={edit} alt="Edit Unit" width="20px" />
          </button>
        </td>
        <td>
          {
            <button className="tableBtn" onClick={() => markOutbound()}>
              <img src={outboundIcon} alt="Outbound" width="20px" />
            </button>
          }
        </td>
        <td className="soldDeleteBtn">
          <button
            className="tableBtn deleteBtn"
            onClick={() => onDelete(currentContainer.id, currentContainer.inventory_id)}>
            <img src={trash} alt="Delete" width="20px"></img>
          </button>
        </td>
      </tr>
      {showEdit && (
        <tr>
          <td colSpan={18}>
            <UpdateSold container={currentContainer} save={saveEdits} close={closeEdit} />
          </td>
        </tr>
      )}
    </>
  );
}

export default SoldRow;
