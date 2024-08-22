import React from 'react'
import { Resend } from 'resend';
import { useState, useEffect } from 'react'
function ContactList() {
const resend = new Resend("re_AtnKVKLh_2V8cQEbZ6MMrEhEx9YoTEyux")
const sendEmail = async () => { 
    const { data, error } = await resend.emails.send({
        from: 'Michelle <michelle@airtightstorage.com>',
        to: ['hlynch02@tufts.edu'],
        subject: 'Hello world',
        html: '<strong> it works </strong>',
      });
}
  return (
    <>
        <div>ContactList</div>
        <button onClick={() => sendEmail()}>EMAIL</button>
    </>
  )
}

export default ContactList