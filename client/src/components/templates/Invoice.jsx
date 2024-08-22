import React from 'react'
import '../../styles/invoice.css'
function Invoice({state}) {
  let html = state.html
  html = html.replace('|', '<img src="https://i.imgur.com/xRDxtJL.png" alt="logo" width="290px"> </img>')
  const obj = {__html:html}
  return (
    <>
      <div dangerouslySetInnerHTML={obj}>
      </div>
    </>    
  )
}

export default Invoice