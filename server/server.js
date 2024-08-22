require("dotenv").config();
const {Resend} = require("resend");
const express = require("express");
const bcrypt = require("bcryptjs");
const session = require('express-session');
const authRoute = require('./routes/auth');
const soldRoute = require('./routes/sold');
const inventoryRoute = require('./routes/inventory');
const releaseRoute = require('./routes/releases');
const db = require("./db");
const cors = require("cors");
const app = express();
const port = process.env.PORT;
const resend = new Resend(process.env.RESEND);

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
}));

app.use(express.json());

app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: 
    { 
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
    } // Set to true if using HTTPS
}));

app.use('/api/v1/auth', authRoute);
app.use('/api/v1/releases', releaseRoute);
app.use('/api/v1/inventory/sold', soldRoute);
app.use('/api/v1/inventory', inventoryRoute);


app.post('/api/v1/send', async (req, res) => {
    const { to, subject, html} = req.body;
    const { data, error } = await resend.emails.send({
      from: 'Michelle <michelle@airtightstorage.com>',
      to: [to],
      subject: subject,
      html: html,
    });
  
    if (error) {
      console.log(error);
      return res.status(400).json({ error });
    }
    res.status(200).json({ data });
});

app.listen(port, () => {
    console.log(`Server is up and listening on port ${port}`);
});