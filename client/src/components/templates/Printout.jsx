import React from 'react';
import { useLocation } from 'react-router-dom';
import Delivery from './Delivery';
import Invoice from './Invoice';
import Template from './Template';
function Printout() {
  let location = useLocation();
  return (
    <div>
      {location.state.type === 'delivery' && <Delivery state={location.state} />}
      {location.state.type === 'invoice' && <Invoice state={location.state} />}
    </div>
  );
}

export default Printout;
