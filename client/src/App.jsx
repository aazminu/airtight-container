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
import Privacy from "./routes/Privacy";
import Terms from "./routes/Terms";
import SampleReceipt from "./routes/SampleReceipt";

// Public-facing paths render without the inventory-app navbar — these
// are external/anonymous viewers (campaign reviewers, drivers tapping
// a receipt link) and the auth-gated nav shouldn't appear.
const PUBLIC_PATHS = ["/privacy", "/terms"];
const isPublicPath = (path) =>
	PUBLIC_PATHS.includes(path) || path.startsWith("/r/");

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
				<Route path="/privacy" element={<Privacy />} />
				<Route path="/terms" element={<Terms />} />
				<Route path="/r/:token" element={<SampleReceipt />} />
			</React.Fragment>
		)
	);
	let url = window.location.href;
	const path = window.location.pathname;
	const hideNav =
		url.includes("form") || path === "/auth" || isPublicPath(path);
	return (
		<>
			<Provider>
				{!hideNav && <Navbar />}
				<PopupContainer />
				<div className="container">
					<RouterProvider router={router} />
				</div>
			</Provider>
		</>
	);
};

export default App;
