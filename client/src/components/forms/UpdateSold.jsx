import React from 'react'
import {useState} from 'react'
function UpdateSold({container, save, close}) {
    const [updatedContainer, setUpdatedContainer] = useState(container)
  
    const setRelease = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, release_number: e.target.value,
        }))
    }
    const setTrucker = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, outbound_trucker: e.target.value,
        }))
    }
    const setModCosts = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, modification_price: e.target.value,
        }))
    }
    const setSalePrice = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, sale_price: e.target.value,
        }))
    }
    const setDestination = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, destination: e.target.value,
        }))
    }
    const setTruckingRate = (e) => {
        setUpdatedContainer(prev=> ({
            ...prev, trucking_rate: e.target.value,
        }))
    }
    const submitForm = (e) => {
        e.preventDefault()
        save(updatedContainer)
    }
    const setDate = (e) => {
        const timestamp = e.target.value;
        timestamp.concat(':00');
        console.log(e.target.value.concat(":00"))
        setUpdatedContainer(prev=> ({
            ...prev, outbound_date: e.target.value.concat(':00'),
        }))
    }
  return (
    <div className="update">
        <form onSubmit={submitForm}>
            <table>
                <tbody>
                    <tr>
                        <td><span className='editSubTitle'>Release Number:</span></td>
                        <td><input type="text" onChange={setRelease} value={updatedContainer.release_number} maxLength="12"></input></td>
                        <td><span className='editSubTitle'>Trucker:</span></td>
                        <td><input type="text" onChange={setTrucker} value={updatedContainer.outbound_trucker} maxLength="5"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Destination:</span></td>
                        <td><input type="text" onChange={setDestination} value={updatedContainer.destination} maxLength="60"></input></td>
                        <td><span className='editSubTitle'>Trucking Rate:</span></td>
                        <td><input type="text" onChange={setTruckingRate} value={updatedContainer.trucking_rate} maxLength="40"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Modification Costs:</span></td>
                        <td><input type="text" onChange={setModCosts} value={updatedContainer.modification_price} maxLength="15"></input></td>
                        <td><span className='editSubTitle'>Sale Price:</span></td>
                        <td><input type="text" onChange={setSalePrice} value={updatedContainer.sale_price} maxLength="20"></input></td>
                    </tr>
                    <tr>
                        <td><span className='editSubTitle'>Outbound Date:</span></td>
                        <td><input className='obDate' type="datetime-local" onChange={setDate} value={updatedContainer.outbound_date} maxLength="15"></input></td>
                        <td><button type='button' className="editBtn" onClick={() => close()}>CLOSE</button></td>
                        <td><button type='submit' className="editBtn">SAVE</button></td>  
                    </tr>
                </tbody>
            </table>
        </form>
    </div>   
  )
}

export default UpdateSold
