import React from "react";
import { useState, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { userContext } from "../../context/userContext";

const PAGE_SIZE = 8;

function ReleaseCard({ company }) {
	const { t } = useTranslation();
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
						<th>{t("releases_panel.release_num")}</th>
						<th>{t("releases_panel.box_count")}</th>
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
							<td colSpan={2}>{t("releases_panel.empty")}</td>
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
						{t("common.prev_arrow")}
					</button>
					<span className="yardPageInfo">
						{t("common.page_of", { page: page + 1, total: pageCount })}
					</span>
					<button
						className="yardPageBtn"
						onClick={() => setPage((p) => p + 1)}
						disabled={page >= pageCount - 1}
					>
						{t("common.next_arrow")}
					</button>
				</div>
			)}
		</div>
	);
}

function ReleaseNumbers() {
	const { setPopup } = useContext(userContext);
	const { t } = useTranslation();
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
					setPopup(t("releases_panel.load_error"));
					return;
				}
				return res.json();
			})
			.then((data) => {
				setReleases(data.data.releases);
			});
	}, [setPopup, t]);
	return (
		<div className="releaseContainer">
			{releases.map((company) => (
				<ReleaseCard key={company.company} company={company} />
			))}
		</div>
	);
}
export default ReleaseNumbers;
