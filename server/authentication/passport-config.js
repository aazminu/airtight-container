const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const db = require("../db");
const bcrypt = require("bcryptjs");

passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password'}, async (email, password, done) => {
    console.log("HITING")
    try {
        const results = await db.query("SELECT * FROM users WHERE email=$1", [email]);
        console.log("Got here", results.rows.length, results.rows[0])
        if(results.rows.length === 0) return res.status(400).json("Invalid email");
        bcrypt.compare(password, results.rows[0].hashed_password).then((res) => {
            if(res){
                return done(null, results.rows[0])
            }
            else{
                return done(null, false, { message: "Incorrect password, try again." })
            }
        });
    } catch (error) {
        console.log(error)
    }
}));
  
passport.serializeUser((user, done) => {
    console.log("SERIALIZING", user.id)
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    console.log('deserializng')
    try {
        const results = await db.query("SELECT * FROM users WHERE id=$1", [id]);
        if(results.rows.length === 0) done(new Error("User not found"));
        else{
            console.log("I'm here now", results.rows[0]);
            done(null, results.rows[0]);
        }
    } catch (error) {
        console.log(error)        
    }
});

module.exports = passport;
