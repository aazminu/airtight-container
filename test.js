const makeSomeRequest = async () => {
	const ERRNO = 123456789;
	try {
		const res = await fetch(`http://place/to/hit/endpoint/from`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});
		const data = await res.json();
		return data;
	} catch (err) {
		console.log("SOME ERROR " + ERRNO);
		return null;
	}
};
