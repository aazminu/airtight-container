const { Pool } = require("pg");

const pool = new Pool({});
(async () => {})();

module.exports = {
	query: (text, params) => pool.query(text, params),
};
