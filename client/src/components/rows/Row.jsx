import React from "react";
import UpdateForm from "../forms/UpdateForm";
import { useState, useEffect, useContext } from "react";
import available from "../../assets/images/available.png";
import outbound from "../../assets/images/outbound.png";
import cart from "../../assets/images/cart.png";
import hold from "../../assets/images/hold.png";
import OutboundForm from "../forms/OutboundForm";
import { userContext } from "../../context/restaurantcontext";

function Row({ container, onDelete }) {
	const { setPopup } = useContext(userContext);
	const date = new Date();
	const offset = date.getTimezoneOffset() / 60;
	const [showForm, setShowForm] = useState(false);
	const [showSold, setShowSold] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [currentContainer, setCurrentContainer] = useState(container);
	const [notes, setNotes] = useState(container.notes);
	const [est, setEst] = useState("");

	const updateNotes = (e) => setNotes(e.target.value);

	const postNotes = () => {
		fetch(`/api/v1/inventory/notes/${container.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ notes }),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) setPopup("ERROR Unable to post notes");
		});
	};

	const closeUpdate = () => setShowForm(false);

	const saveChanges = (updatedContainer) => {
		fetch(`/api/v1/inventory/${updatedContainer.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updatedContainer),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) setPopup("ERROR Unable to edit container.");
			setCurrentContainer(updatedContainer);
			setShowForm(false);
		});
	};

	const saveOutbound = (updatedContainer) => {
		setCurrentContainer((prev) => ({ ...prev, state: "sold" }));
		fetch(`/api/v1/inventory/sold/${updatedContainer.id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updatedContainer),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Ensure fields are properly formatted and that this unit has not already been assigned to outbounds.");
			} else {
				setPopup("Container has been marked as Outbound.");
				setShowSold(false);
			}
		});
	};

	const closeOutbound = () => setShowSold(false);

	useEffect(() => {
		var containerTime = currentContainer.date.substr(11, 8);
		var hour = 0;
		for (var i = 0; i < containerTime.length; i++) {
			var char = containerTime.charAt(i);
			if (char === ":") break;
			if (i === 0) hour += Number(char) * 10;
			else hour += Number(char);
		}
		hour -= offset;
		if (hour < 0) hour += 24;
		setEst(hour.toString() + containerTime.substr(2, 6));
	}, [currentContainer.date, offset]);

	const checkState = () => {
		if (currentContainer.state === "available") return available;
		if (currentContainer.state === "hold") return hold;
		if (currentContainer.state === "sold") return cart;
		return outbound;
	};

	const setHold = (e) => {
		e.stopPropagation();
		if (currentContainer.state === "outbound" || currentContainer.state === "sold") {
			setPopup("ERROR Container is not available to be held.");
			return;
		}
		const newState = currentContainer.state === "hold" ? "available" : "hold";
		setCurrentContainer((prev) => ({ ...prev, state: newState }));
		fetch(`/api/v1/inventory/state/${currentContainer.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ state: newState }),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) return;
			newState === "hold"
				? setPopup("Successfully marked as held, be sure to make note of the holdee.")
				: setPopup("Hold successfully removed.");
		});
	};

	return (
		<>
			{/* ── Collapsed row — click anywhere to expand ── */}
			<tr className="inventoryRow" onClick={() => setExpanded((p) => !p)}>
				<td style={{ paddingLeft: "18px" }}>{currentContainer.unit_number}</td>
				<td>{currentContainer.size}</td>
				<td className="stateCell">
					<img
						src={checkState()}
						alt={currentContainer.state}
						width="22px"
						height="22px"
					/>
				</td>
				<td>{currentContainer.sale_company || <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
				<td>{currentContainer.date.substr(0, 10)}</td>
				<td className="chevronCell">
					<span className={`expandChevron${expanded ? " open" : ""}`}>›</span>
				</td>
			</tr>

			{/* ── Expanded detail drawer (always rendered; height via CSS grid trick) ── */}
			<tr className={`expandedRow${expanded ? " drawerOpen" : ""}`}>
				<td colSpan={6}>
					<div className="drawerSlide">
						<div className="expandedDrawer">
							<div className="drawerInner">
								<div className="drawerGrid">
									<div className="drawerField">
										<span className="fieldLabel">Damage</span>
										<span className="fieldValue">{currentContainer.damage || "—"}</span>
									</div>
									<div className="drawerField">
										<span className="fieldLabel">Trucking Co.</span>
										<span className="fieldValue">{currentContainer.trucking_company || "—"}</span>
									</div>
									<div className="drawerField">
										<span className="fieldLabel">Acceptance #</span>
										<span className="fieldValue">{currentContainer.acceptance_number || "—"}</span>
									</div>
									<div className="drawerField">
										<span className="fieldLabel">Acq. Price</span>
										<span className="fieldValue">
											{currentContainer.aquisition_price
												? `$${currentContainer.aquisition_price}`
												: "—"}
										</span>
									</div>
									<div className="drawerField">
										<span className="fieldLabel">Time Added (EST)</span>
										<span className="fieldValue">{est}</span>
									</div>
									<div className="drawerField drawerFieldWide">
										<span className="fieldLabel">Notes</span>
										<input
											type="text"
											className="drawerNotesInput"
											onChange={updateNotes}
											onBlur={postNotes}
											onClick={(e) => e.stopPropagation()}
											value={notes === null ? "" : notes}
											placeholder="Add notes…"
											maxLength="255"
										/>
									</div>
								</div>
								<div className="drawerActions">
									<button className="drawerBtn" onClick={setHold}>
										{currentContainer.state === "hold" ? "Release Hold" : "Hold"}
									</button>
									<button
										className="drawerBtn"
										onClick={(e) => { e.stopPropagation(); setShowSold((p) => !p); }}
									>
										Mark Outbound
									</button>
									<button
										className="drawerBtn"
										onClick={(e) => { e.stopPropagation(); setShowForm((p) => !p); }}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true" style={{flexShrink:0}}>
											<path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
											<path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
										</svg>
										Edit
									</button>
									<button
										className="drawerBtn drawerBtnDanger"
										onClick={(e) => { e.stopPropagation(); onDelete(currentContainer.id); }}
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true" style={{flexShrink:0}}>
											<path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
										</svg> Delete
									</button>
								</div>
							</div>
						</div>
					</div>
				</td>
			</tr>

			{/* ── Outbound form ── */}
			<tr className={`updateRow${showSold ? " drawerOpen" : ""}`}>
				<td colSpan={6}>
					<div className="drawerSlide">
						<div className="expandedDrawer">
							<OutboundForm
								container={currentContainer}
								save={saveOutbound}
								close={closeOutbound}
							/>
						</div>
					</div>
				</td>
			</tr>

			{/* ── Edit form ── */}
			<tr className={`updateRow${showForm ? " drawerOpen" : ""}`}>
				<td colSpan={6}>
					<div className="drawerSlide">
						<div className="expandedDrawer">
							<UpdateForm
								container={currentContainer}
								save={saveChanges}
								close={closeUpdate}
							/>
						</div>
					</div>
				</td>
			</tr>
		</>
	);
}

export default Row;
