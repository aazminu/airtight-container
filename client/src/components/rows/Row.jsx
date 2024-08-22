import React from 'react'
import UpdateForm from '../forms/UpdateForm'
import {useState, useEffect, useContext} from 'react'
import {useNavigate} from 'react-router-dom'
import avaiable from "../../assets/images/available.png"
import outbound from "../../assets/images/outbound.png"
import cart from "../../assets/images/cart.png"
import hold from "../../assets/images/hold.png"
import trash from "../../assets/images/delete.png"
import view from "../../assets/images/view.png"
import edit from "../../assets/images/edit.png"
import OutboundForm from '../forms/OutboundForm'
import { userContext } from '../../context/restaurantcontext'
function Row({container, onDelete}) {
  const { setPopup } = useContext(userContext)
  const date = new Date()
  const offset = (date.getTimezoneOffset() / 60)
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [currentContainer, setCurrentContainer] = useState(container)
  const [notes, setNotes] = useState(container.notes);
  const [est, setEst] = useState("")
  const updateNotes = (e) => {
    setNotes(e.target.value);
  }

  const goToContainerPage = async (id) =>{
    navigate(`/inventory/${id}`)
  }

  const postNotes = () => {
    console.log("attempting to post notes:")
    fetch(`/api/v1/inventory/notes/${container.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                notes: notes
            }),
            credentials: 'include'
    }).then((res) => {
        if(!res.ok){
            setPopup("ERROR Unable to post notes")
            return undefined
        }
        return res.json()
    }).then((data) => {
        if(!data) return
        console.log(data.data.inventory)
    })
  }
  const closeUpdate = () => {
    setShowForm(!showForm);
  }
  const saveChanges = (container) => {
    fetch(`/api/v1/inventory/${container.id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(container),
        credentials: 'include'
    }).then((res) => {
        if(!res.ok){
            setPopup("ERROR Unable to edit container.")
        }
        setCurrentContainer(container);
        return res.json()
    }).then((data) => {
        setShowForm(!showForm)
    })
  }
  const saveOutbound = (container) => {
    setCurrentContainer(prev=> ({
      ...prev, state: "sold",
    }))
    fetch(`/api/v1/inventory/sold/${container.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(container),
      credentials: 'include'
    }).then((res) => {
      if(!res.ok){
        setPopup("ERROR Ensure fields are properly formatted and that this unit has not already been assigned to outbounds.")
      }
      else{
        setPopup("Container has been marked as Outbound.")
        setShowSold(!showSold);
      }
    })
  }
  const closeOutbound = () => {
    setShowSold(!showSold);
  }
  useEffect(() => {
    var containerTime = currentContainer.date.substr(11,8)
    var hour = 0;
    for(var i = 0; i < containerTime.length; i++){
      var char = containerTime.charAt(i)
      if(char === ':'){
        break;
      }
      else{
        if(i === 0) hour += (Number(char)*10)
        else hour+= Number(char)
      }
    }
    hour -= offset
    if(hour < 0) hour += 24
    setEst(hour.toString() + containerTime.substr(2, 6));
  }, [currentContainer.date, offset]);
  
  const checkState = () => {
    if(currentContainer.state === 'available'){
      return avaiable;
    }
    else if(currentContainer.state === 'hold'){
      return hold;
    }
    else if(currentContainer.state === 'sold'){
      return cart;
    }
    else{
      return outbound;
    }
  }

  const setHold = () => {
    var newState;
    if(currentContainer.state === 'outbound' || currentContainer.state === 'sold'){
      setPopup("ERROR Container is not available to be held.")
      return;
    } 
    currentContainer.state === 'hold' ? newState = 'available' : newState = 'hold'
    setCurrentContainer((prev) => ({
      ...prev, state: newState,
      }
    ));
    fetch(`/api/v1/inventory/state/${currentContainer.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: newState,
      }),
      credentials: 'include'
    }).then((res) => {
      if(!res.ok){
        console.log("error")
      }
      else{
        newState === 'hold' ? setPopup("Successfully marked as held, be sure to make note of the holdee.") : setPopup("Hold succesfully removed.")
      }
    })
  }
  return (
    <>
      <tr key={currentContainer.id}>
        <td>{currentContainer.id}</td>
        <td className='dateRow'>{currentContainer.date.substr(0, 10)} <br/>{est}</td>
        <td>{currentContainer.unit_number}</td>
        <td>{currentContainer.size}</td>
        <td>{currentContainer.damage}</td>
        <td>{currentContainer.trucking_company}</td>
        <td>{currentContainer.acceptance_number}</td>
        <td>{currentContainer.sale_company}</td>
        <td>{currentContainer.aquisition_price && '$'}{currentContainer.aquisition_price ? currentContainer.aquisition_price : 'N/A'}</td>
        <td className='stateRow'><img src={checkState()} alt="whoops" width="25px" height="25px"></img></td>
        <td><input type="text" onChange={updateNotes} onBlur={postNotes} value={notes === null ? "" : notes} placeholder="Insert notes here:" maxLength="255"></input></td>
        <td className='placeholderRow'><button className="tableBtn" onClick={() => setHold()}><span className='btnText'>HOLD</span></button></td>
        <td className='placeholderRow'><button className="tableBtn" onClick={currentContainer.state !== 'sold' && currentContainer.state !== 'outbound' ? () => setShowSold(!showSold) : () => setPopup("ERROR Container is already sold or offiste, can not be sold.")}><span className='btnText'>SELL</span></button></td>
        <td className='placeholderRow'><button className="tableBtn" onClick={() => goToContainerPage(currentContainer.id)}><img src={view} alt="View Unit" width="20px"/></button></td>
        <td className='placeholderRow'><button className="tableBtn" onClick={() => setShowForm(!showForm)}><img src={edit} alt="Edit Unit" width="20px"/></button></td>
        <td className='placeholderRow'><button className="tableBtn deleteBtn" onClick={() => onDelete(currentContainer.id)}><img src={trash} alt="Delete" width="20px"></img></button></td>
      </tr>
      {showSold && <tr className="updateRow"><td colSpan={16}><OutboundForm container={currentContainer} save={saveOutbound} close={closeOutbound}/></td></tr>}
      {showForm && <tr className='updateRow'><td colSpan={16}><UpdateForm container={currentContainer} save={saveChanges} close={closeUpdate}/></td></tr>}
    </>
  )
}

export default Row
