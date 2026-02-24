import React from "react";
import { useState, useEffect, useContext } from "react";
import { userContext } from "../../context/restaurantcontext";
import trash from "../../assets/images/delete.png";

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
											<img
												src={trash}
												alt="Delete"
												width="20px"
											></img>
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
