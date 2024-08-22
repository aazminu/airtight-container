import React from 'react'
import { useState, useEffect } from 'react'
function YardRow({container}) {
    const [invTime, setInvTime] = useState("")
    const date = new Date()
    const offset = (date.getTimezoneOffset() / 60)
    useEffect(() => {
      if(container.state !== 'sold') return
        var containerTime = container.outbound_date.substr(11,8)
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
        setInvTime(hour.toString() + containerTime.substr(2, 6));
      }, [container.outbound_date, offset, container.state]);
  return (
    <>
      <tr key={container.id}>
        <td>{container.unit_number}</td>
        <td>{container.size}</td>
        {container.state === "sold" && 
        <>
            <td className='dateRow'>{container.outbound_date.substr(0, 10)} <br/>{invTime}</td>
            <td>{container.release_number}</td>
        </>
        }
      </tr>
    </>
  )
}

export default YardRow