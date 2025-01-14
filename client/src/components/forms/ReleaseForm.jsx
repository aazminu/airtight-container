import React from "react";
import { useState, useEffect, useContext } from "react";
import Bubble from "../Bubble";
import exit from "../../assets/images/exithover.png";
import { userContext } from "../../context/restaurantcontext";
function ReleaseForm({ type, company, deleteCompany }) {
	const { setPopup } = useContext(userContext);
	const [releases, setReleases] = useState([]);
	const [newRelease, setNewRelease] = useState({
		number: "",
		box_count: 1,
	});
	const [refresh, setRefresh] = useState(true);
	const [width, setWidth] = useState("13px");

	useEffect(() => {
		setReleases(company.numbers);
	}, [company.numbers]);

	const addRelease = () => {
		fetch(`api/v2/release/`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				company_id: company.id,
				number: newRelease.number,
				box_count: newRelease.box_count,
			}),
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup(
						"ERROR There was an error adding the Release Number"
					);
					return;
				}
				return res.json();
			})
			.then((data) => {
				console.log("DATA:");
				console.log(data);
				setReleases((prev) => [
					...prev,
					{
						release_id: data.data[0].release_number_id,
						release_count: newRelease.box_count,
						release_number: newRelease.number,
					},
				]);
			});
	};

	const removeRelease = (content) => {
		console.log("ID PASSED: " + content.release_id);
		fetch(`api/v2/release/${content.release_id}`, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup(
					"ERROR There was an error deleting the Release Number"
				);
				return;
			}
			// Live-remove the release from the list
			company.numbers = company.numbers.filter((number) => {
				return number.release_id !== content.release_id;
			});
			setReleases(company.numbers);
			return;
		});
	};

	const submitRelease = (e) => {
		e.preventDefault();
		if (newRelease.number === "") {
			setPopup("Please Add A Valid Release Number to Add");
			return;
		}
		addRelease();
		setNewRelease({ number: "", box_count: 1 });
	};

	const setReleaseNumber = (e) => {
		setNewRelease((prev) => ({
			...prev,
			number: e.target.value,
		}));
	};

	const setReleaseCount = (e) => {
		console.log("NEW VAL: " + e.target.value);
		setNewRelease((prev) => ({
			...prev,
			box_count: e.target.value,
		}));
	};

	return (
		<div className="releaseForm">
			<div className="companyName bold">
				{company.company}{" "}
				<button
					className="bubbleBtn"
					onClick={() => deleteCompany(company.id)}
					onMouseOver={() => setWidth("15px")}
					onMouseLeave={() => setWidth("13px")}
				>
					<img src={exit} width={width} alt="X"></img>
				</button>
			</div>
			<div className="bubbleContainer">
				{releases.length > 0 ? (
					releases.map((release) => {
						return (
							<Bubble
								content={release}
								deleteBubble={removeRelease}
							/>
						);
					})
				) : (
					<p>N/A</p>
				)}
			</div>
			<form onSubmit={submitRelease}>
				<span className="addPrompt">
					<input
						placeholder="Add a release number:"
						type="text"
						value={newRelease.number}
						onChange={setReleaseNumber}
					></input>
					<span className="boxCount">
						<label>Box Count: </label>
						<input
							type="number"
							min="1"
							max="100"
							value={newRelease.box_count}
							onChange={setReleaseCount}
						></input>
					</span>
					<button className="addBtn">Add</button>
				</span>
			</form>
		</div>
	);
}

export default ReleaseForm;
