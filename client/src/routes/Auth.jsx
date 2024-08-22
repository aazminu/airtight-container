import React from 'react'
import { useState, useContext } from 'react'
import '../styles/auth.css'
import { userContext } from '../context/restaurantcontext'
function Auth() {
  const { setPopup } = useContext(userContext)
  const [authType, setAuthType] = useState("Login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  const changeAuthType = () => {
    if(authType === 'Login'){
        setAuthType("Register")
    } 
    else{
        setAuthType("Login")
    }
  }

  const authUser = (e) => {
    e.preventDefault()
    let endpoint = authType.toLowerCase();
    fetch(`/api/v1/auth/${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: email,
            password: password
        }),
        credentials: "include"
    }).then((res) => {
        if(!res.ok){
            (endpoint === "login") ? setPopup("ERROR There was an error logging in, try again.") : setPopup("ERROR There was an error when creating your account, try again.");
        }
        if(res.status !== 200){
                let dataHolder = {user: {permissions: "unauthorized", message: "login failed please try again"}}
                return dataHolder;
        }
        return res.json();
    }).then((data) => {
        if(endpoint === "login"){
            if(data.user.permissions !== 'unauthorized'){
                (data.user.permissions === 'employee') ? window.location.href = '/yardview' : window.location.href = '/';
            }
            else{
                setErrorMsg(data.message)
            }
        }
        else{
            setPopup("Account successfully created, please sign in.")
        }
    })
  }
  return (
    <div className='authContainer'>
        <div className='formContainer'>
            <div className='formHeader'>{authType === "Login" ? "Sign in" : "Create an Account"}</div>
            <div className="formBody">
                <form onSubmit={authUser}>
                    <input type="email" className='loginInput' placeholder="Email:" value={email} onChange={(e) => setEmail(e.target.value)}/>
                    <input type="password" className='loginInput' placeholder="Password:" value={password} onChange={(e) => setPassword(e.target.value)}/>
                    <button className='authBtn'>{authType}</button>
                </form>
                <p className='authOptions'>
                    {authType === "Login" ? "First time signing in?" : "Already have an account?"} 
                    <button className="authPrompt" onClick={() => changeAuthType()}>
                        {authType === "Login" ? "Create an account" : "Sign into an existing account"}
                    </button>
                </p>
                <p className='errorMsg'>{errorMsg}</p>
            </div>
        </div>
    </div>
  )
}

export default Auth