import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";

const PAGE_SIZE = 8;

function ReleaseCard({ company }) {
	const [page, setPage] = useState(0);
	const pageCount = Math.ceil(company.numbers.length / PAGE_SIZE);
	const pageItems = company.numbers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

	return (
		<div className="releaseTableCard">
			<h3 className="yardHead">
				{company.company}
				<span className="yardCount">{company.numbers.length}</span>
			</h3>
			<table className="releaseTable">
				<thead>
					<tr>
						<th>Release #</th>
						<th>Box Count</th>
					</tr>
				</thead>
				<tbody>
					{pageItems.length !== 0 ? (
						pageItems.map((number) => (
							<tr key={number.release_number}>
								<td>{number.release_number}</td>
								<td>{number.release_count}</td>
							</tr>
						))
					) : (
						<tr>
							<td colSpan={2}>N/A</td>
						</tr>
					)}
				</tbody>
			</table>
			{pageCount > 1 && (
				<div className="yardPagination">
					<button
						className="yardPageBtn"
						onClick={() => setPage((p) => p - 1)}
						disabled={page === 0}
					>
						&#8592; Prev
					</button>
					<span className="yardPageInfo">
						{page + 1} / {pageCount}
					</span>
					<button
						className="yardPageBtn"
						onClick={() => setPage((p) => p + 1)}
						disabled={page >= pageCount - 1}
					>
						Next &#8594;
					</button>
				</div>
			)}
		</div>
	);
}

function ReleaseNumbers() {
	const { setPopup } = useContext(userContext);
	const [releases, setReleases] = useState([]);
	useEffect(() => {
		fetch("/api/v2/release", {
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
			{releases.map((company) => (
				<ReleaseCard key={company.company} company={company} />
			))}
		</div>
	);
}
export default ReleaseNumbers;
