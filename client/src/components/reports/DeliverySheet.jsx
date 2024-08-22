import React from 'react'
import {useState, useEffect, useContext} from 'react'
import {useNavigate} from 'react-router-dom'
import { userContext } from '../../context/restaurantcontext'
function DeliverySheet() {
  const { setPopup } = useContext(userContext)
  const navigate = useNavigate()
  const [boxes, setBoxes] = useState([]);
  const [selection, setSelection] = useState("");
  const [details, setDetails] = useState({
    cust_name: "",
    cust_address: "",
    cust_tsz: "",
    orientation: "",
    contact: "",
    pickup: "",
    date: "",
  })
  useEffect(() => {
    fetch("http://localhost:8080/api/v1/inventory/sold", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
        credentials: 'include'
    }).then((res) => {
        if(!res.ok){
            setPopup("ERROR Unable to get inventory")
            return undefined
        }
        return res.json()
    }).then((data) => {
        if(!data) return;
        console.log("BOXES", data.data.inventory)
        setBoxes(data.data.inventory);
        setSelection(data.data.inventory[0].unit_number)
    })
  }, [setPopup]);
  const submitForm = (e) => {
    e.preventDefault()
    let container = boxes.find((option) => {
      return option.unit_number === selection;
    })
    navigate('/reports/form', {state:{type:"delivery", container: container, details: details}})
    window.location.reload()
  }
  const updateSelection = (e) => {
    setSelection(e.target.value)
  }
  const setName = (e) => {
    setDetails(prev => ({
      ...prev, cust_name: e.target.value,
    }))
  }
  const setAddress = (e) => {
    setDetails(prev => ({
      ...prev, cust_address: e.target.value,
    }))
  }
  const setTSZ = (e) => {
    setDetails(prev => ({
      ...prev, cust_tsz: e.target.value,
    }))
  }
  const setOrientation = (e) => {
    setDetails(prev => ({
      ...prev, orientation: e.target.value,
    }))
  }
  const setContact = (e) => {
    setDetails(prev => ({
      ...prev, contact: e.target.value,
    }))
  }
  const setPickup = (e) => {
    setDetails(prev => ({
      ...prev, pickup: e.target.value,
    }))
  }
  const setDate = (e) => {
    setDetails(prev => ({
      ...prev, date: e.target.value,
    }))
  }
  return (
    <div className='repContainer'>
      <div className='card'>
        <div className='reportTitle'>
          Produce Delivery Sheet
        </div>
        <div className='reportDesc'>
          <p>Generate a delivery sheet for a sold box selected below.</p>
        </div>
        <div className="dSheetForm">
          <form onSubmit={submitForm} className='repForm'>
            <label>
              <select defaultValue={""} onChange={updateSelection} className='repSelect deliverySelect'>
                {boxes.map((option) => {
                  return(
                    <option value={option.unit_number}>{option.unit_number}</option>
                  )
                })}
              </select>
            </label>
            <p>Customer Info: </p>
            <div className="formInputs">
              <div className="repRow">
                <span><input type="text" value={details.cust_name} onChange={setName} placeholder='Name:'></input></span>
                <span><input type="text" value={details.cust_address} onChange={setAddress} placeholder='Address:'></input></span>
              </div>
              <div className="repRow">
                <span><input type="text" value={details.cust_tsz} onChange={setTSZ} placeholder='Town, State, Zipcode:'></input></span>
                <span><input type="text" value={details.contact} onChange={setContact} placeholder='Onsite Contact:'></input></span>
              </div>
              <div className="repRow">
                <span><input type="text" value={details.orientation} onChange={setOrientation} placeholder='Container Orientation:'></input></span>
                <span><input type="text" value={details.pickup} onChange={setPickup} placeholder='Payment Details:'></input></span>
              </div>
              <div className="repRow delivDateRow">
                <label>Delivery Date:</label> <input type="datetime-local" className='obDate delivDate' value={details.date} onChange={setDate}></input>
              </div>
              <button className='editBtn'>Generate</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default DeliverySheet