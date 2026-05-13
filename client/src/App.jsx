import React from "react";
import {
	Route,
	Navigate,
	createBrowserRouter,
	createRoutesFromElements,
	RouterProvider,
} from "react-router-dom";
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
import Clients from "./routes/Clients";
import Intake from "./routes/Intake";
import Audit from "./routes/Audit";

const App = () => {
	const router = createBrowserRouter(
		createRoutesFromElements(
			<React.Fragment>
				<Route path="/" element={<Home />} />
				<Route path="/auth" element={<Auth />} />
				<Route path="/inventory/:id" element={<Detail />} />
				{/* Legacy /add path → new multi-step intake (PR 2.2). */}
				<Route path="/add" element={<Navigate to="/intake" replace />} />
				<Route path="/invoices" element={<Invoices />} />
				<Route path="/invoices/create" element={<CreateInvoice />} />
				<Route path="/reports" element={<Reports />} />
				<Route path="/yardview" element={<YardView />} />
				<Route path="/dashboard" element={<Dashboard />} />
				<Route path="/clients" element={<Clients />} />
				<Route path="/intake" element={<Intake />} />
				<Route path="/audit" element={<Audit />} />
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
