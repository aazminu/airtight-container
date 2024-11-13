import React from 'react';
import '../styles/dashboard.css';
import SetReleases from '../components/forms/SetReleases';
import ContactList from '../components/lists/ContactList';

function Dashboard() {
  return (
    <div className="dashContainer">
      <h1 className="invHeader">Dashboard</h1>
      <SetReleases />
      <ContactList />
    </div>
  );
}

export default Dashboard;
