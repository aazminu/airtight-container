import React from 'react';
import UpcomingOutbounds from '../components/lists/UpcomingOutbounds';
import ReleaseNumbers from '../components/lists/ReleaseNumbers';
import '../styles/yardview.css';
function YardView() {
  return (
    <div className="yardContainer">
      <h1 className="invHeader">Yard View</h1>
      <div className="releases">
        <h2 className="releaseTitle">Valid Release Numbers</h2>
        <ReleaseNumbers />
      </div>
      <div className="inventoryInfo">
        <UpcomingOutbounds type="available" />
        <UpcomingOutbounds type="sold" />
        <UpcomingOutbounds type="hold" />
      </div>
    </div>
  );
}

export default YardView;
