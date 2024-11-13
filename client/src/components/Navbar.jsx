import React from 'react';
import { useContext, useState } from 'react';
import '../styles/navbar.css';
import logo from '../assets/images/airtightfixed.png';
import profile from '../assets/images/profile.png';
import { userContext } from '../context/restaurantcontext';

function Navbar() {
  const [showUserOps, setShowUserOps] = useState(false);
  const [userWidth, setuserWidth] = useState('40px');
  const { user, setUser, setPopup } = useContext(userContext);

  const logout = () => {
    fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    }).then((res) => {
      if (!res.ok) return setPopup('ERROR There was an error logging out');
      else {
        setUser({ email: 'unauthorized', permissions: 'unauthorized' });
        window.location.href = '/auth';
      }
      return res.json();
    });
  };

  const changeWidth = () => {
    userWidth === '40px' ? setuserWidth('45px') : setuserWidth('40px');
  };
  return (
    <div className="navbar">
      <img src={logo} alt="logo" width={'10%'}></img>
      <nav>
        {user.permissions !== 'unauthorized' && (
          <ul>
            {user.permissions === 'admin' && (
              <>
                <li>
                  <a href="/">Inventory</a>
                </li>
                <li>
                  <a href="/sold">Sold Boxes</a>
                </li>
                <li>
                  <a href="/reports" target="_blank">
                    Reports
                  </a>
                </li>
                <li>
                  <a href="/dashboard">Dashboard</a>
                </li>
              </>
            )}
            <li>
              <a href="/yardview">Yard View</a>
            </li>
            <li>
              <a href="/add">Add A Box</a>
            </li>
            <li>
              <a href="/help">Help</a>
            </li>
          </ul>
        )}
      </nav>
      <div className="profileContainer">
        <img
          className="userProfile"
          src={profile}
          alt="profile"
          width={userWidth}
          onClick={() => setShowUserOps(!showUserOps)}
          onMouseOver={() => changeWidth()}
          onMouseLeave={() => changeWidth()}></img>
        {showUserOps && (
          <div className="profileDropdown">
            <div>{user.email === 'unauthorized' ? 'Guest' : user.email}</div>
            <button className="logoutBtn authBtn" onClick={() => logout()}>
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Navbar;
