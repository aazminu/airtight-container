import React from 'react'
import { useState } from 'react'
import exit from '../assets/images/exit.png'
import exithover from '../assets/images/exithover.png'
function Bubble({content, removeBubble}) {
  const [source, setSource] = useState(exit)
  return (
    <div className='bubble'>
        <span>{content}</span> 
        <button className='bubbleBtn' onClick={() => removeBubble(content)} onMouseOver={() => setSource(exithover)} onMouseLeave={() => setSource(exit)}>
            <img src={source} width='10px' alt='X'></img>
        </button>
    </div>
  )
}

export default Bubble