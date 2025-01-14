import React from 'react';
import { useEffect, useState } from 'react';
import SoldRow from '../rows/SoldRow';
import SearchContainers from '../SearchContainers';
import rightarrow from '../../assets/images/rightarrow.png';
import leftarrow from '../../assets/images/leftarrow.png';
function SoldList() {
  const [inventory, setInventory] = useState([]);
  const [filters, setFilters] = useState([]);
  const [page, setPage] = useState(1);
  const [displayNum, setDisplayNum] = useState(5);
  const [currentPage, setCurrentPage] = useState([]);
  useEffect(() => {
    fetch('/api/v1/inventory/sold', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then((res) => {
        if (!res.ok) {
          console.log('shit');
          return;
        }
        return res.json();
      })
      .then((data) => {
        var result = data.data.inventory.filter((res) => {
          return res.state === 'sold';
        });
        console.log('RES', data.data.inventory);
        setInventory(result);
      });
  }, []);

  const handleDelete = async (id, inv_id) => {
    const confirm = window.confirm('Are you sure you want to delete this container?');
    if (!confirm) return;

    try {
      const res = await fetch(`/api/v1/inventory/sold/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      setInventory(
        inventory.filter((container) => {
          return container.id !== id;
        })
      );
    } catch (error) {
      console.log(error);
    }
    try {
      const res = await fetch(`/api/v1/inventory/sold/available/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inventory_id: inv_id
        }),
        credentials: 'include'
      })
        .then((res) => {
          if (!res.ok) {
            console.log('error');
          }
          return res.json();
        })
        .then((data) => {
          console.log('worked');
        });
    } catch (error) {
      console.log(error);
    }
  };
  const outbound = (id) => {
    setInventory(
      inventory.filter((container) => {
        return container.id !== id;
      })
    );
  };

  var maxPageNumber = Math.ceil(inventory.length / displayNum);
  if (inventory.length % displayNum === 0) maxPageNumber += 1;

  useEffect(() => {
    var start = (page - 1) * displayNum;
    var end = start + displayNum;
    var pageHolder = inventory.slice(start, end);
    console.log('Slicing from', start, 'to', end);
    console.log(typeof pageHolder, pageHolder);
    setCurrentPage(pageHolder);
  }, [page, displayNum, inventory]);

  // FILTERS:
  const searchContainers = (value) => {
    if (value === '') {
      setFilters([]);
      return;
    }
    var filterHolder = [];
    for (let i = 0; i < inventory.length; i++) {
      if (!JSON.stringify(inventory[i]).toLowerCase().includes(value.toLowerCase())) {
        filterHolder.push(inventory[i].id);
      }
    }
    setFilters(filterHolder);
    filterHolder = [];
  };
  const changePageDisplay = (e) => {
    setDisplayNum(e.target.value);
  };
  return (
    <>
      <div className="inventoryContainer">
        <SearchContainers search={searchContainers} />
        <table className="inventoryTable">
          <thead>
            <tr className="inventoryHeader">
              <th scope="col">ID</th>
              <th scope="col">Sale Date</th>
              <th scope="col">Outbound Date</th>
              <th scope="col">Release Number</th>
              <th scope="col">Unit Number</th>
              <th scope="col">Size</th>
              <th scope="col">Trucker</th>
              <th scope="col">Destination</th>
              <th scope="col">Trucking Rate</th>
              <th scope="col">Modification Cost</th>
              <th scope="col">Sale Price</th>
              <th scope="col">Invoice Notes</th>
              <th scope="col" className="paginateCol" colSpan={2}>
                <button
                  className="arrow"
                  onClick={page !== 1 ? () => setPage(page - 1) : () => setPage(page)}>
                  <img src={leftarrow} alt="left" width="10px"></img>
                </button>
                <span className="pageDisplay">
                  Page {page} of {maxPageNumber}
                </span>
                <button
                  className="arrow"
                  onClick={page !== maxPageNumber ? () => setPage(page + 1) : () => setPage(page)}>
                  <img src={rightarrow} alt="right" width="10px"></img>
                </button>
              </th>
              <th scope="col" className="displayCol" colspan={3}>
                <label>
                  <span className="pageDisplay">Results Per Page:</span>
                </label>
                <br />
                <select className="pgDisplayDropdown" onChange={changePageDisplay}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={40}>40</option>
                  <option value={50}>50</option>
                </select>
              </th>
            </tr>
          </thead>
          <tbody className="inventoryBody">
            {filters.length > 0
              ? inventory.map((container) => {
                  return (
                    !filters.includes(container.id) && (
                      <SoldRow
                        container={container}
                        onDelete={handleDelete}
                        key={container.id}
                        outbound={outbound}
                      />
                    )
                  );
                })
              : currentPage.map((container) => {
                  return (
                    <SoldRow
                      container={container}
                      onDelete={handleDelete}
                      key={container.id}
                      outbound={outbound}
                    />
                  );
                })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default SoldList;
