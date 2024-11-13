import React from 'react';
import Header from '../components/Header';
import InventoryList from '../components/lists/InventoryList';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { userContext } from '../context/restaurantcontext';
const Home = () => {
  const navigate = useNavigate();
  const { permissions } = useContext(userContext);

  if (permissions === 'unauthorized') navigate('/auth');

  return (
    <div>
      {permissions}
      <Header />
      <InventoryList />
    </div>
  );
};

export default Home;
