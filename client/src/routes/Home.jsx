import React from 'react';
import Inventory from './Inventory';
import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { userContext } from '../context/restaurantcontext';
const Home = () => {
  const navigate = useNavigate();
  const { permissions } = useContext(userContext);

  if (permissions === 'unauthorized') navigate('/auth');

  return <Inventory />;
};

export default Home;
