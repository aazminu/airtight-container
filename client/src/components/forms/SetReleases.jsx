import React from "react";
import { useState, useEffect, useContext } from "react";
import ReleaseForm from "./ReleaseForm";
import { userContext } from "../../context/restaurantcontext";
function SetReleases() {
	const { setPopup } = useContext(userContext);
	const [releases, setReleases] = useState([]);
	const [newName, setNewName] = useState("");
	const [add, setAdd] = useState(false);
	useEffect(() => {
		fetch("api/v2/release", {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Failed to get release numbers");
					return;
				}
				return res.json();
			})
			.then((data) => {
				console.log(data.data.releases);
				if (data && data.data && data.data.releases) {
					setReleases(data.data.releases);
				}
			});
	}, [setPopup, setReleases]);

	const deleteCompany = (id) => {
		let confirm = window.confirm(
			"Are you sure you want to remove this company?"
		);
		if (!confirm) return;
		fetch(`api/v2/release/company/${id}`, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR There was an error removing this company");
				return;
			} else {
				setReleases(
					releases.filter((company) => {
						return company.id !== id;
					})
				);
			}
		});
	};

	const addNew = (e) => {
		fetch("api/v2/release/company", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: newName,
			}),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Unable to add new company");
				return;
			} else {
				setPopup("Company added!");
				return;
			}
		});
	};

	const setName = (e) => {
		setNewName(e.target.value);
	};

	return (
		<>
			<h3 className="relSubtitle">Release Numbers</h3>
			<div className="releaseFormContainer">
				<div className="addWrapper">
					<button
						onClick={() => setAdd(!add)}
						className="addBtn bottomBtn"
					>
						Add A Company
					</button>
					{add && (
						<form onSubmit={addNew} className="addForm">
							<input
								type="text"
								placeholder="New Company Name"
								value={newName}
								onChange={setName}
							></input>
							<button className="addBtn addCompanyBtn">
								Submit
							</button>
						</form>
					)}
				</div>
				<div>
					{releases.map((company) => {
						return (
							<>
								<ReleaseForm
									type="existing"
									company={company}
									deleteCompany={deleteCompany}
								/>
								<br />
							</>
						);
					})}
				</div>
				<br />
			</div>
		</>
	);
}

export default SetReleases;
