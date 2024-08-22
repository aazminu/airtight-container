const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require("bcryptjs");
const db = require("../db");
const router = Router();

const checkAuth = (req, res, next) => {
    if(req.session.userId) return next();
    else{
        res.status(401).json({ message: 'Unauthorized', user: {email: "unauthorized", permissions: 'unauthorized'}});
    }
}

router.get('/', checkAuth, (req, res) => {
    if(req.session.permissions === 'admin') return res.json({message: "admin auth'd", user: { email: req.session.email, permissions: req.session.permissions}})
    res.json({ message: 'User is authenticated', user: {email: req.session.email, permissions: req.session.permissions}});
});

//POST
router.post("/register", body('email').isEmail(), body('password').isLength({min: 6}), async (req, res) => {
    const errors = validationResult(req);
    try{
        if (!errors.isEmpty() && errors.errors[0].param === 'email') {
            return res.status(400).json({ message: 'Invalid email address. Please try again.'})
        }
        if (!errors.isEmpty() && errors.errors[0].param === 'password') {
            return res.status(400).json({ message: 'Password is too short.'})
        }
        var salt = bcrypt.genSaltSync(10);
        var hash = bcrypt.hashSync(req.body.password, salt);
        const results = await db.query("INSERT INTO users (email, hashed_password, permissions) VALUES ($1, $2, 'none')", [req.body.email, hash]);
        res.status(200).json({
            status: "success",
            results: results.rows.length,
            data:{
                inventory: results.rows
            },
        });
    } catch(err){
        res.status(400).json(err);
    }
});

router.post('/login', async (req, res) => {
    if(req.session.userId) return res.status(200).json({ message: "User is already signed in", user: { email: req.session.email, permissions: req.session.permissions}})
    if(!req.body.email || !req.body.password) return res.status(400).json({ message: "Invalid username or password", user: { email: "invalid", permissions: "unauthorized"}})
    
    try {
        const results = await db.query("SELECT * FROM users WHERE email=$1", [req.body.email]);

        if(results.rows.length === 0) return res.status(400).json("Invalid email");
        bcrypt.compare(req.body.password, results.rows[0].hashed_password).then((response) => {
            if(response){
                req.session.userId = results.rows[0].id;
                req.session.permissions = results.rows[0].permissions;
                req.session.email = results.rows[0].email;
                return res.status(200).json({user: {email: req.session.email, permissions: req.session.permissions}, message: "Login Successful"});
            }
            else{
                return res.status(400).json({ message: "Incorrect password, try again.", user: { email: "unauthorized", permissions: "unauthorized"}})
            }
        });
    } catch (error) {
        console.log(error)
        res.status(400);
    }
});

router.post('/logout', async (req, res) => {
    req.session.destroy();
    res.status(200).json({ message: 'Logged Out Successfully', user: {email: "unauthorized", permissions: "unauthorized"}});
});
  

module.exports = router;