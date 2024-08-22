import React from 'react'
import { useContext } from 'react'
import { userContext } from '../context/restaurantcontext'
import Popup from './Popup';
function PopupContainer() {
  const {popup, setPopup} = useContext(userContext);
  return (
    <>
      {popup !== "" && <Popup message={popup} setMessage={setPopup}/> }
    </>
  )
}

export default PopupContainer