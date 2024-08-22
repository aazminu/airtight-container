import React from 'react'

function AddInfo() {
  return (
    <div className='infoContainer'>
        <table className='addTable infoTable'>
                <thead>
                    <tr className="inventoryHeader">
                        <th>INSTRUCTIONS:</th>
                    </tr>
                </thead>
                <tbody className='inventoryBody'>
                    <tr><td className='editSubTitle'>Unit Number:</td></tr>
                    <tr><td>Four letters, seven numbers formatted as: <span className='bold'>LLLL######-#</span> ex: <span className='bold'>DRYU951932-4</span>
                    </td></tr>
                    <tr><td className='editSubTitle'>Size:</td></tr>
                    <tr><td>Formatted as: [length]'[high-cube or standard] ex: <span className='bold'>40'HC, 20'DV</span></td></tr>
                    <tr><td className='editSubTitle'>Damage:</td></tr>
                    <tr><td>Note any damage upon inspection, if no damage, denote: <span className='bold'>WWT</span></td></tr>
                    <tr><td className='editSubTitle'>Trucking Company:</td></tr>
                    <tr><td>Name of trucking company/driver ex: <span className='bold'>Airtight Trucking</span></td></tr>
                    <tr><td className='editSubTitle'>Acceptance Number:</td></tr>
                    <tr><td>Number found on intake form from the driver, formatted as: <span className='bold'>LLLL$#####</span> ex: <span className="bold">ANYC$2583</span></td></tr>
                    <tr><td className='editSubTitle'>Sale Company:</td></tr>
                    <tr><td>Container company ex: <span className="bold">SeaCube, Triton, etc</span></td></tr>
                    <tr><td className='editSubTitle'>Aquisition Price:</td></tr>
                    <tr><td>Price we paid for the box, leave blank if unsure</td></tr>
                    <tr><td className='editSubTitle'>Images:</td></tr>
                    <tr><td>Take 4 images of the box on the truck: <span className="bold">Front, Back, Sides, Inside</span></td></tr>
                </tbody>
            </table>
    </div>
  )
}

export default AddInfo