import React from 'react'
import { useEffect, useState } from 'react'
import "../styles/popup.css"
function Popup({message, setMessage}) {
  const [isError, setIsError] = useState(false)
  
  useEffect(() => {
    if(message.substring(0,5) === "ERROR"){
      console.log("ERROR")
      setIsError(true);
      setMessage(message.substring(5))
    }  
  }, [message, setMessage]);
  
  return (
    <div className='popupContainer'>
        <div className="popup">
            <p className='popupTitle'>{isError ? "Whoops!" : "Success!"}</p>
            <p className='error'>{message}</p>
            <button className='addBtn popupBtn' onClick={() => setMessage("")}>Dismiss</button>
        </div>
    </div>
  )
}

export default Popup