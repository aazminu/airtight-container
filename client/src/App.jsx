import React from "react";
import {
	Route,
	createBrowserRouter,
	createRoutesFromElements,
	RouterProvider,
} from "react-router-dom";
import Add from "./routes/Add";
import Detail from "./routes/Detail";
import Home from "./routes/Home";
import { Provider } from "./context/restaurantcontext";
import Navbar from "./components/Navbar";
import Reports from "./routes/Reports";
import Invoices from "./routes/Invoices";
import YardView from "./routes/YardView";
import Dashboard from "./routes/Dashboard";
import Printout from "./components/templates/Printout";
import Auth from "./routes/Auth";
import PopupContainer from "./components/PopupContainer";
import CreateInvoice from "./routes/CreateInvoice";

const App = () => {
	const router = createBrowserRouter(
		createRoutesFromElements(
			<React.Fragment>
				<Route path="/" element={<Home />} />
				<Route path="/auth" element={<Auth />} />
				<Route path="/inventory/:id" element={<Detail />} />
				<Route path="/add" element={<Add />} />
				<Route path="/invoices" element={<Invoices />} />
				<Route path="/invoices/create" element={<CreateInvoice />} />
				<Route path="/reports" element={<Reports />} />
				<Route path="/yardview" element={<YardView />} />
				<Route path="/dashboard" element={<Dashboard />} />
				<Route path="/reports/form" element={<Printout />} />
			</React.Fragment>
		)
	);
	let url = window.location.href;
	const path = window.location.pathname;
	return (
		<>
			<Provider>
				{!url.includes("form") && path !== "/auth" && <Navbar />}
				<PopupContainer />
				<div className="container">
					<RouterProvider router={router} />
				</div>
			</Provider>
		</>
	);
};

export default App;
