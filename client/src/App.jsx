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
import { Provider } from "./context/userContext";
import Navbar from "./components/Navbar";
import { ToastProvider, ConfirmProvider, PromptProvider } from "./components/ui";
import Reports from "./routes/Reports";
import CreateReport from "./routes/CreateReport";
import ReportDetail from "./routes/ReportDetail";
import Invoices from "./routes/Invoices";
import YardView from "./routes/YardView";
import Dashboard from "./routes/Dashboard";
import Auth from "./routes/Auth";
import PopupContainer from "./components/PopupContainer";
import CreateInvoice from "./routes/CreateInvoice";
import Clients from "./routes/Clients";
import Intake from "./routes/Intake";
import Audit from "./routes/Audit";
import Releases from "./routes/Releases";
import TemplatesPreview from "./routes/TemplatesPreview";
import InvoiceDetail from "./routes/InvoiceDetail";
import ShInvoices from "./routes/ShInvoices";
import ShInvoiceDetail from "./routes/ShInvoiceDetail";
import Help from "./routes/Help";
import PrintReceipt from "./routes/PrintReceipt";
import Outbound from "./routes/Outbound";
import SmsTerms from "./routes/SmsTerms";
import PrivacyPolicy from "./routes/PrivacyPolicy";

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
				<Route path="/invoices/:id" element={<InvoiceDetail />} />
				<Route path="/sh-invoices" element={<ShInvoices />} />
				<Route path="/sh-invoices/:id" element={<ShInvoiceDetail />} />
				<Route path="/reports" element={<Reports />} />
				<Route path="/reports/new" element={<CreateReport />} />
				<Route path="/reports/new/:type" element={<CreateReport />} />
				<Route path="/reports/:id" element={<ReportDetail />} />
				<Route path="/reports/:id/print" element={<PrintReceipt />} />
				<Route path="/outbound" element={<Outbound />} />
				<Route path="/sms-terms" element={<SmsTerms />} />
				<Route path="/privacy-policy" element={<PrivacyPolicy />} />
				<Route path="/yardview" element={<YardView />} />
				<Route path="/dashboard" element={<Dashboard />} />
				<Route path="/clients" element={<Clients />} />
				<Route path="/intake" element={<Intake />} />
				<Route path="/audit" element={<Audit />} />
				<Route path="/releases" element={<Releases />} />
				<Route path="/help" element={<Help />} />
				{import.meta.env.DEV && (
					<Route
						path="/admin/templates"
						element={<TemplatesPreview />}
					/>
				)}
			</React.Fragment>
		)
	);
	const path = window.location.pathname;
	return (
		<>
			<Provider>
				<ToastProvider>
					<ConfirmProvider>
						<PromptProvider>
							{path !== "/auth" &&
								path !== "/sms-terms" &&
								path !== "/privacy-policy" &&
								!path.startsWith("/admin/templates") &&
								!/^\/reports\/[^/]+\/print$/.test(path) && <Navbar />}
							<PopupContainer />
							<div className="container">
								<RouterProvider router={router} />
							</div>
						</PromptProvider>
					</ConfirmProvider>
				</ToastProvider>
			</Provider>
		</>
	);
};

export default App;
