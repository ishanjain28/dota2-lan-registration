require('dotenv').config();
const express = require('express'),
    path = require('path'),
    bodyParser = require('body-parser'),
    Insta = require('instamojo-nodejs'),
    MongoClient = require('mongodb').MongoClient,
    app = express(),
    PORT = process.env.PORT || 5000,
    MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/dota2-lan";

// Connect to Mongo
MongoClient.connect(MONGODB_URI, (err, db) => {
    if (err) throw err;
    app.locals.db = db;
});

// Set Instamojo keys
Insta.setKeys(process.env.INSTA_API_KEY, process.env.INSTA_AUTH_KEY);
// Dev Mode
Insta.isSandboxMode(true);
// Enable Body parser
app.use(bodyParser.urlencoded({ extended: false }));
// Serve static Files
app.use(express.static(path.resolve(process.cwd(), 'dist')));
// Disable X-Powered-By header from requests
app.disable('x-powered-by');

// Receive and create a Request URI
app.post('/get_request_uri',
    // Validate Data
    (req, res, next) => {
        if (req.body && req.body.team_name && req.body.team_captain && req.body.email && req.body.organisation_name && req.body.contact_required) {
            next();
        } else {
            res.status(404).write('Not Found');
            res.end();
        }
    },
    // Create Request URL
    (req, res) => {
        let data = new Insta.PaymentData();
        data.purpose = "DOTA 2 LAN Gaming Competition"
        data.amount = 100;
        data.buyer_name = req.body.team_name;
        data.email = req.body.email;
        data.phone = req.body.contact_required;
        data.send_sms = 'True';
        data.send_email = 'True';
        data.setRedirectUrl("http://dota2-lan.herokuapp.com/payment_status");
        data.webhook = "http://dota2-lan.herokuapp.com/payment_webhook"
        Insta.createPayment(data, (error, resp) => {
            let response = JSON.parse(resp);
            if (error) {
                console.error(error);
            } else if (response.success) {
                res.send(JSON.stringify({
                    redirect_url: response.payment_request.longurl,
                    error: 0
                }));
                console.log(response.payment_request.longurl);
            } else {
                res.status(400).write("Invalid Data");
                res.end();
                console.log(response);
            }
        })
    })

app.get('/payment_status', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), './dist/payment_status.html'));
});

app.post('/payment_webhook', (req, res) => {
    const db = req.app.locals.db,
        teamsList = db.collection('teamsList'),
        response = req.body;
    teamsList.insertOne({
        name: response.buyer_name,
        email: response.email,
        phone_no: response.buyer_phone,
        status: response.status,
        payment_id: response.payment_id,
        payment_request_id: response.payment_request_id,
    }, (err, result) => {
        if (err) throw err;
        if (result.nInserted) {
            console.log({
                name: response.buyer_name,
                email: response.email,
                phone_no: response.buyer_phone,
                status: response.status,
                payment_id: response.payment_id,
                payment_request_id: response.payment_request_id,
            })
        }
    });
    res.end();
});

app.listen(PORT, (err) => {
    if (err) throw err;
    process.stdout.write(`Server Started on ${PORT}
`);
})