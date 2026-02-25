import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";

function UserList() {
	const { setPopup } = useContext(userContext);
	const [accounts, setAccounts] = useState([]);
	useEffect(() => {
		fetch(`/api/v2/dashboard`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		})
			.then((res) => {
				if (!res.ok) {
					setPopup("ERROR Unable to get users");
					return undefined;
				}
				return res.json();
			})
			.then((data) => {
				if (!data) return;
				setAccounts(data.accounts);
			});
	}, [setPopup]);

	const deleteUser = async (user) => {
		const confirm = window.confirm(
			"Are you sure you want to delete this user? They will be unable to login to the system."
		);
		if (!confirm) return;

		fetch(`/api/v2/dashboard/${user.id}`, {
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Unable to delete user");
				return;
			}
			setAccounts((current) =>
				current.filter((acct) => acct.id !== user.id)
			);
		});
	};

	const updatePermissions = (account) => (e) => {
		const newPermission = e.target.value;
		const confirm = window.confirm(
			`Are you sure you want to set ${account.email} to ${newPermission}? This will affect their abilities to control the site.`
		);
		if (!confirm) return;

		fetch(`/api/v2/dashboard/${account.id}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				new_permissions: newPermission,
			}),
			credentials: "include",
		}).then((res) => {
			if (!res.ok) {
				setPopup("ERROR Unable to change permissions");
				return undefined;
			}
			setAccounts((current) => {
				return current.map((acct) =>
					acct.id === account.id
						? { ...acct, permissions: newPermission }
						: acct
				);
			});
		});
	};
	return (
		<div className="accountSettingsWrapper">
			<h3 className="relSubtitle">Accounts</h3>
			<div className="accountTable">
				<table className="inventoryTable">
					<thead className="inventoryHeader">
						<th>Email</th>
						<th>Permisisons</th>
						<th>Delete User</th>
					</thead>
					<tbody>
						{accounts.map((account) => {
							return (
								<tr className="userRow" key={account.id}>
									<td>{account.email}</td>
									<td className="center">
										<select
											value={account.permissions}
											onChange={updatePermissions(
												account
											)}
											className="permissionSelect"
										>
											<option value={"none"}>None</option>
											<option value={"employee"}>
												Employee
											</option>
											<option value={"admin"}>
												Admin
											</option>
										</select>
									</td>
									<td className="center">
										<button
											className="tableBtn deleteBtn"
											onClick={() => deleteUser(account)}
										>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
										</button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

export default UserList;
