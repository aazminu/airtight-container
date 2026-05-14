import UpcomingOutbounds from '../components/lists/UpcomingOutbounds';
import ReleaseNumbers from '../components/lists/ReleaseNumbers';
import { ShYardSection } from '../components/yard/ShYardSection';
import '../styles/yardview.css';

// Section order (top-down): Units by Type → Valid Release Numbers →
// Storage & Handling. Yard staff hit "what's in the yard right now"
// more often than "what releases are valid", so units come first.
function YardView() {
  return (
    <div className="yardContainer">
      <h1 className="invHeader">Yard View</h1>

      <div className="yardUnitSection">
        <p className="yardSectionLabel">Units by Type</p>
        <div className="inventoryInfo">
          <UpcomingOutbounds type="available" />
          <UpcomingOutbounds type="sold" />
          <UpcomingOutbounds type="hold" />
        </div>
      </div>

      <div className="yardReleasesSection">
        <p className="yardSectionLabel">Valid Release Numbers</p>
        <ReleaseNumbers />
      </div>

      <ShYardSection />
    </div>
  );
}

export default YardView;
