const { Router } = require('express');
const db = require("../db");
const router = Router();

    const checkAuth = (req, res, next) => {
        if(req.session.permissions !== "none") return next();
        else{
            console.log("Unauth'd action")
            res.status(401).json({ message: 'Unauthorized action', user: {email: req.session.email, permissions: req.session.permissions}});
        }
    }

    const checkAdmin = (req, res, next) => {
        if(req.session.permissions === 'admin') return next();
        else{
            console.log("Unauth'd admin action", req.session.permissions)
            res.status(401).json({ message: 'Unauthorized action, admin access only.', user: {email: req.session.email, permissions: req.session.permissions}});
        }
    }

    router.get("/", checkAuth, async (req, res) => {
        try{
            const results = await db.query("select * from inventory ORDER BY state");
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    router.get("/:id", checkAuth, async (req, res) => {
        try{
            const results = await db.query("select * from inventory where id = $1", [req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    router.get("/state", checkAuth, async (req, res) => {
        try{
            const results = await db.query("select * from inventory WHERE state=$1 ORDER BY id", [req.body.state]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    //POSTS
    router.post("/add", checkAuth, async (req, res) => {
        try{
            const results = await db.query("INSERT INTO inventory (date, unit_number, size, damage, trucking_company, acceptance_number, sale_company, state, notes, aquisition_price) VALUES (CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7, $8, $9) returning *", [req.body.unit_number, req.body.size, req.body.damage, req.body.trucking_company, req.body.acceptance_number, req.body.sale_company, req.body.state, req.body.notes, req.body.aquisition_price]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    //PUTS
    router.put("/:id", checkAdmin, async (req, res) => {
        try{
            const results = await db.query("UPDATE inventory SET unit_number = $1, size = $2, damage = $3, trucking_company = $4, acceptance_number = $5, sale_company = $6, state = $7, aquisition_price = $8 where id = $9 returning *",
            [req.body.unit_number, req.body.size, req.body.damage, req.body.trucking_company, req.body.acceptance_number, req.body.sale_company, req.body.state, req.body.aquisition_price, req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    router.put("/notes/:id", checkAdmin, async (req, res) => {
        try{
            const results = await db.query("UPDATE inventory SET notes = $1 where id = $2 returning *", [req.body.notes, req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    router.put("/state/:id", checkAdmin, async (req, res) => {
        try{
            const results = await db.query("UPDATE inventory SET state = $1 where id = $2 returning *", [req.body.state, req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });

    router.put("/outbound/:id", checkAdmin, async (req, res) => {
        try{
        const results = await db.query("UPDATE sold SET outbound_date = CURRENT_TIMESTAMP WHERE id=$1 returning *",
            [req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });
    //DELETES
    router.delete("/:id", checkAdmin, async (req, res) => {
        try{
            const results = await db.query("DELETE from inventory where id = $1", [req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
    });
    
    router.delete("/:id", checkAdmin, async (req, res) => {
        try{
            const results = await db.query("DELETE from sold where id = $1", [req.params.id]);
            res.status(200).json({
                status: "success",
                results: results.rows.length,
                data:{
                    inventory: results.rows
                },
            });
        } catch(err){
            console.log(err);
            res.status(400);
        }
        try{
            const results = await db.query("UPDATE inventory SET state = 'available' where id = $1", [req.body.inventory_id])
            res.status(200).json({
                status:"success"
            })
        }catch(err){
            console.log(err);
            res.status(400)
        }
    });
    
module.exports = router;