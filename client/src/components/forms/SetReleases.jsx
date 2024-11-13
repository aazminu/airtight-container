import React from 'react';
import { useState, useEffect, useContext } from 'react';
import ReleaseForm from './ReleaseForm';
import { userContext } from '../../context/restaurantcontext';
function SetReleases() {
  const { setPopup } = useContext(userContext);
  const [releases, setReleases] = useState([]);
  const [newName, setNewName] = useState('');
  const [add, setAdd] = useState(false);
  useEffect(() => {
    fetch('/api/v1/releases', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) {
          setPopup('ERROR Failed to get release numbers');
          return;
        }
        return res.json();
      })
      .then((data) => {
        setReleases(data.data.inventory);
      });
  }, [setPopup]);
  const deleteCompany = (id) => {
    let confirm = window.confirm('Are you sure you want to remove this company?');
    if (!confirm) return;
    fetch(`/api/v1/releases/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) {
        setPopup('ERROR There was an error removing this company');
        return;
      } else {
        setReleases(
          releases.filter((company) => {
            return company.id !== id;
          })
        );
      }
    });
  };
  const setName = (e) => {
    setNewName(e.target.value);
  };
  const addNew = (e) => {
    fetch(`/api/v1/releases`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company: newName,
        number: '{}'
      }),
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) {
        setPopup('ERROR Unable to add new company');
        return;
      } else {
        setPopup('Company added!');
        return;
      }
    });
  };
  return (
    <>
      <h3 className="relSubtitle">Release Numbers</h3>
      <div className="releaseFormContainer">
        {releases.map((company) => {
          return (
            <>
              <ReleaseForm type="existing" company={company} deleteCompany={deleteCompany} />
              <br />
            </>
          );
        })}
        {add && (
          <form onSubmit={addNew}>
            <input type="text" value={newName} onChange={setName}></input>
            <button>Add Company</button>
          </form>
        )}
        <br />
      </div>
      <button onClick={() => setAdd(!add)} className="addBtn bottomBtn">
        Add A Company
      </button>
    </>
  );
}

export default SetReleases;
