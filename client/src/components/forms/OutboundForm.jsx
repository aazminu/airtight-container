import React from 'react'
import {useState, useEffect} from 'react'
function OutboundForm({container, save, close}) {
    const [updatedContainer, setUpdatedContainer] = useState(container)
    useEffect(() => {
        setUpdatedContainer(prev=> ({
            ...prev, state: "sold",
        }))
        setUpdatedContainer(prev=> ({
            ...prev, outbound_date: "2024-01-01T00:00:00",
        }))
    }, []);
    const setOutboundTrucker = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, outbound_trucker: e.target.value,
        }))
    }
    const setDestination = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, destination: e.target.value,
        }))
    }
    const setSalePrice = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, sale_price: e.target.value,
        }))
    }
    const setReleaseNumber = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, release_number: e.target.value,
        }))
    }
    const setTruckingRate = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, trucking_rate: e.target.value,
        }))
    }
    const setModPrice = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, modification_price: e.target.value,
        }))
    }
    const setDate = (e) => {
        const timestamp = e.target.value;
        timestamp.concat(':00');
        console.log(e.target.value.concat(":00"))
        setUpdatedContainer(prev=> ({
            ...prev, outbound_date: e.target.value.concat(':00'),
        }))
    }
    const submitForm = (e) => {
        e.preventDefault()
        console.log("outbound date", updatedContainer.outbound_date)
        save(updatedContainer)
    }
    
  return (
    <div>
        <form onSubmit={submitForm} className="update">
            <table>
                <tbody>
                    <tr>
                        <td><span className='editSubTitle'>Trucker:</span></td>
                        <td><input type="text" onChange={setOutboundTrucker} value={updatedContainer.outbound_trucker} maxLength="20"></input></td>
                        <td><span className="editSubTitle">Destination:</span></td>
                        <td><input type="text" onChange={setDestination} value={updatedContainer.destination} maxLength="20"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Sale Price:</span></td>
                        <td><input type="text" onChange={setSalePrice} value={updatedContainer.sale_price} maxLength="60"></input></td>
                        <td><span className='editSubTitle'>Release Number:</span></td>
                        <td><input type="text" onChange={setReleaseNumber} value={updatedContainer.release_number} maxLength="40"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Trucking Rate:</span></td>
                        <td><input type="text" onChange={setTruckingRate} value={updatedContainer.trucking_rate} maxLength="15"></input></td>
                        <td><span className='editSubTitle'>Mod Price:</span></td>
                        <td><input type="text" onChange={setModPrice} value={updatedContainer.modification_price} maxLength="20"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Outbound Date:</span></td>
                        <td><input type="datetime-local" onChange={setDate} value={updatedContainer.outbound_date ? updatedContainer.outbound_date : "2024-01-01T00:00:00"} maxLength="15" className='obDate'></input></td>
                        <td><button type='button' className="editBtn" onClick={() => close()}>CLOSE</button></td>
                        <td><button type='submit' className="editBtn">SAVE</button></td>
                    </tr>
                </tbody>
            </table>
        </form>
    </div>   
  )
}

export default OutboundForm
