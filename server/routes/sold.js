const { Router } = require('express');
const db = require('../db');
const router = Router();

const checkAuth = (req, res, next) => {
  if (req.session.permissions !== 'none') return next();
  else {
    console.log("Unauth'd action");
    res
      .status(401)
      .json({
        message: 'Unauthorized action',
        user: { email: req.session.email, permissions: req.session.permissions }
      });
  }
};

const checkAdmin = (req, res, next) => {
  if (req.session.permissions === 'admin') return next();
  else {
    console.log("Unauth'd admin action", req.session.permissions);
    res
      .status(401)
      .json({
        message: 'Unauthorized action, admin access only.',
        user: { email: req.session.email, permissions: req.session.permissions }
      });
  }
};

//GETS
router.get('/', checkAuth, async (req, res) => {
  try {
    const results = await db.query(
      'select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id ORDER BY sold.id'
    );
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

router.get('/:unitNumber', checkAuth, async (req, res) => {
  try {
    const results = await db.query(
      'select * from inventory INNER JOIN sold ON sold.inventory_id = inventory.id where inventory.unit_number=$1',
      [req.params.unitNumber]
    );
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

//POSTS
router.post('/:id', checkAdmin, async (req, res) => {
  try {
    const results = await db.query(
      'INSERT INTO sold (inventory_id, sold_date, outbound_trucker, destination, sale_price, release_number, trucking_rate, modification_price, outbound_date) VALUES ($1, CURRENT_TIMESTAMP, $2, $3, $4, $5, $6, $7, $8) returning *',
      [
        req.body.id,
        req.body.outbound_trucker,
        req.body.destination,
        req.body.sale_price,
        req.body.release_number,
        req.body.trucking_rate,
        req.body.modification_price,
        req.body.outbound_date
      ]
    );
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
  try {
    const results = await db.query("UPDATE inventory SET state = 'sold' where id = $1", [
      req.body.id
    ]);
    res.status(200).json({
      status: 'success'
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

//PUTS
router.put('/:id', checkAdmin, async (req, res) => {
  try {
    const results = await db.query(
      'UPDATE sold SET release_number = $1, outbound_trucker = $2, destination = $3, trucking_rate = $4, modification_price = $5, sale_price = $6, outbound_date=$7::TIMESTAMP where id = $8 returning *',
      [
        req.body.release_number,
        req.body.outbound_trucker,
        req.body.destination,
        req.body.trucking_rate,
        req.body.modification_price,
        req.body.sale_price,
        req.body.outbound_date,
        req.params.id
      ]
    );
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

router.put('/available/:id', checkAdmin, async (req, res) => {
  try {
    const results = await db.query("UPDATE inventory SET state = 'available' where id = $1", [
      req.body.inventory_id
    ]);
    res.status(200).json({
      status: 'success'
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

router.put('/notes/:id', checkAdmin, async (req, res) => {
  try {
    const results = await db.query('UPDATE sold SET invoice_notes = $1 where id = $2 returning *', [
      req.body.invoice_notes,
      req.params.id
    ]);
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});

router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    const results = await db.query('DELETE from sold where id = $1', [req.params.id]);
    res.status(200).json({
      status: 'success',
      results: results.rows.length,
      data: {
        inventory: results.rows
      }
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
  try {
    const results = await db.query("UPDATE inventory SET state = 'available' where id = $1", [
      req.body.inventory_id
    ]);
    res.status(200).json({
      status: 'success'
    });
  } catch (err) {
    console.log(err);
    res.status(400);
  }
});
module.exports = router;
