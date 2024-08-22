import React from 'react'
import { useState, useEffect, useContext } from 'react'
import Bubble from '../Bubble'
import exit from '../../assets/images/exithover.png'
import { userContext } from '../../context/restaurantcontext'
function ReleaseForm({type, company, deleteCompany}) {
  const { setPopup } = useContext(userContext)
  const [releases, setReleases] = useState([])
  const [newRelease, setNewRelease] = useState("")
  const [refresh, setRefresh] = useState(true);
  const [width, setWidth] = useState('13px');
  useEffect(() => {
    setReleases(company.number);
  }, [company.number]);
  const postReleases = (final) => {
    fetch(`/api/v1/releases`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            company: company.company,
            number: final,
        }),
        credentials: 'include'
    }).then((res) => {
        if(!res.ok){
            setPopup("ERROR There was an error adding this release number")
            return
        }
        return;
    })
  }
  const putReleases = (final) => {
    fetch(`/api/v1/releases/${company.id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            company: company.company,
            number: final,
        }),
        credentials: 'include'
    }).then((res) => {
        if(!res.ok){
            setPopup("ERROR There was an error updating the Release Number")
            return
        }
        return;
    })
  }
  const submitRelease = (e) => {
    e.preventDefault()
    releases.push(newRelease);
    var myString = JSON.stringify(releases)
    var semi = myString.replace('[', "{");
    var final = semi.replace(']', "}");
    if(type==='new'){
        postReleases(final);
    }
    else if(type==='existing'){
        putReleases(final);
    }
    setNewRelease('');
  }
  const removeRelease = (content) => {
    var removeInd = releases.indexOf(content);
    releases.splice(removeInd, 1)
    var myString = JSON.stringify(releases)
    var semi = myString.replace('[', "{");
    var final = semi.replace(']', "}");
    putReleases(final);
    setRefresh(!refresh);
  }

  return (
    <div className='releaseForm'>
        <div className='companyName bold'>{company.company} <button className='bubbleBtn' onClick={() => deleteCompany(company.id)} onMouseOver={() => setWidth('15px')} onMouseLeave={() => setWidth('13px')}><img src={exit} width={width} alt='X'></img></button></div>
        <div className='bubbleContainer'>
            {releases.length > 0 ? releases.map((release) => {
                    return(
                        <Bubble content={release} removeBubble={removeRelease}/>
                    )
                }) : <p>N/A</p>}
        </div>
        <form onSubmit={submitRelease}>
            <span className='addPrompt'><input placeholder='Add a release number:' type='text' value={newRelease} onChange={(e) => setNewRelease(e.target.value)}></input></span>
            <button className='addBtn'>Add</button>
        </form>
        
    </div>
  )
}

export default ReleaseForm