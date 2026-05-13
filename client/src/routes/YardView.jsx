import React from 'react';
import UpcomingOutbounds from '../components/lists/UpcomingOutbounds';
import ReleaseNumbers from '../components/lists/ReleaseNumbers';
import { ShYardSection } from '../components/yard/ShYardSection';
import '../styles/yardview.css';
function YardView() {
  return (
    <div className="yardContainer">
      <h1 className="invHeader">Yard View</h1>
      <div className="yardReleasesSection">
        <p className="yardSectionLabel">Valid Release Numbers</p>
        <ReleaseNumbers />
      </div>
      <div className="yardUnitSection">
        <p className="yardSectionLabel">Units by Type</p>
        <div className="inventoryInfo">
          <UpcomingOutbounds type="available" />
          <UpcomingOutbounds type="sold" />
          <UpcomingOutbounds type="hold" />
        </div>
      </div>
      <ShYardSection />
    </div>
  );
}

export default YardView;
