import React from 'react';
import { useState, useEffect, useContext } from 'react';
import { userContext } from '../../context/restaurantcontext';
function ReleaseNumbers() {
  const { setPopup } = useContext(userContext);
  const [releases, setReleases] = useState([]);
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
  return (
    <div className="releaseContainer">
      {releases.map((company) => {
        return (
          <table className="releaseTable">
            <tr>
              <th className="companyHead inventoryHeader">{company.company}</th>
            </tr>
            {company.number.length !== 0 ? (
              company.number.map((numbers) => {
                return (
                  <tr>
                    <td>{numbers}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td>N/A</td>
              </tr>
            )}
          </table>
        );
      })}
    </div>
  );
}
export default ReleaseNumbers;
