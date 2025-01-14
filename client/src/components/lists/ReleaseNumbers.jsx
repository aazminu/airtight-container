import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";
function ReleaseNumbers() {
	const { setPopup } = useContext(userContext);
	const [releases, setReleases] = useState([]);
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
				setReleases(data.data.releases);
			});
	}, [setPopup]);
	return (
		<div className="releaseContainer">
			{releases.map((company) => {
				return (
					<div className="selectorTable">
						<table className="releaseTable">
							<tr>
								<th className="companyHead inventoryHeader">
									{company.company}
								</th>
								<th className="companyHead inventoryHeader">
									Box Count
								</th>
							</tr>
							{company.numbers.length !== 0 ? (
								company.numbers.map((number) => {
									return (
										<tr>
											<td>{number.release_number}</td>
											<td>{number.release_count}</td>
										</tr>
									);
								})
							) : (
								<tr>
									<td>N/A</td>
								</tr>
							)}
						</table>
					</div>
				);
			})}
		</div>
	);
}
export default ReleaseNumbers;
