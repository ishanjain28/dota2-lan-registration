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

// payment-status page
app.get('/payment_status', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), './dist/payment_status.html'));
});
// Registrations Page
app.get('/register_log', (req, res) => {
    res.sendFile(path.resolve(process.cwd(), './dist/registrations.html'));
});
app.disable('x-powered-by');
// Disable X-Powered-By header from requests

// Receive and create a Request URI
app.post('/get_request_uri',
    // Validate Data
    (req, res, next) => {
        if (req.body &&
            req.body.team_name &&
            req.body.team_captain &&
            req.body.player_one &&
            req.body.player_one_link &&
            req.body.player_two &&
            req.body.player_two_link &&
            req.body.player_three &&
            req.body.player_three_link &&
            req.body.player_four &&
            req.body.player_four_link &&
            req.body.player_five &&
            req.body.player_five_link &&
            req.body.optional_player_one &&
            req.body.optional_player_one_link &&
            req.body.optional_player_two &&
            req.body.optional_player_two_link &&
            req.body.email &&
            req.body.organisation_name &&
            req.body.contact_required) {
            next();
        } else {
            console.log(req.body)
            res.status(404).write('Not Found');
            res.end();
        }
    },
    // Create Request URL
    (req, res) => {
        const db = req.app.locals.db,
            teamsList = db.collection('teamsList');
        let data = new Insta.PaymentData();

        let team_name = req.body.team_name.split(" ").join("-");
        data.purpose = "DOTA 2 LAN Gaming Competition"
        data.amount = 513;
        data.buyer_name = team_name;
        data.email = req.body.email;
        data.phone = req.body.contact_required;
        data.send_sms = 'False';
        data.send_email = 'False';
        data.setRedirectUrl("http://dota2-lan.herokuapp.com/payment_status");
        data.webhook = "http://dota2-lan.herokuapp.com/payment_webhook"
        Insta.createPayment(data, (error, resp) => {
            if (error) {
                console.error(error);
            } else {
                let response = JSON.parse(resp);
                if (response.success) {
                    teamsList.insertOne({
                        required_contact: req.body.contact_required,
                        optional_contact: req.body.contact_optional,
                        team_name: team_name,
                        captain_name: req.body.team_captain,
                        players: {
                            1: {
                                name: req.body.player_one,
                                link: req.body.player_one_link
                            },
                            2: {
                                name: req.body.player_two,
                                link: req.body.player_two_link
                            },
                            3: {
                                name: req.body.player_three,
                                link: req.body.player_three_link
                            },
                            4: {
                                name: req.body.player_four,
                                link: req.body.player_four_link
                            },
                            5: {
                                name: req.body.player_five,
                                link: req.body.player_five_link,
                            },
                            6: {
                                name: req.body.optional_player_one,
                                link: req.body.optional_player_one_link,
                            },
                            7: {
                                name: req.body.optional_player_two,
                                link: req.body.optional_player_two_link,
                            }
                        },
                        organisation_name: req.body.organisation_name,
                        email: req.body.email,
                        payment_status: "Pending",
                        payment_url: response.payment_request.longurl
                    }, (err, result) => {
                        if (err) throw err;
                    });
                    res.send(JSON.stringify({
                        redirect_url: response.payment_request.longurl,
                        error: 0
                    }));
                } else {
                    res.status(400).write("Invalid Data");
                    res.end();
                    console.log(response);
                }
            }
        })

    });

app.post('/payment_webhook', (req, res) => {
    const db = req.app.locals.db,
        teamsList = db.collection('teamsList'),
        response = req.body;
    teamsList.updateOne({
        team_name: response.buyer_name,
        email: response.buyer
    }, {
        $set: {
            payment_status: response.status,
            payment_id: response.payment_id,
            payment_request_id: response.payment_request_id,
            payment_url: ''
        }
    }, (err, result) => {
        if (err) throw err;
        console.log({
            name: response.buyer_name,
            email: response.buyer,
            phone_no: response.buyer_phone,
            status: response.status,
            payment_id: response.payment_id,
            payment_request_id: response.payment_request_id,
        })
    });
    res.end();
});

app.post('/verify_payment', (req, res) => {
    const db = req.app.locals.db,
        teamsList = db.collection('teamsList');
    if (req.body && req.body.payment_id && req.body.payment_request_id) {
        // console.log({
        // payment_id: req.body.payment_id,
        // payment_request_id: req.body.payment_request_id
        // });
        teamsList.findOne({
            payment_id: req.body.payment_id,
            payment_request_id: req.body.payment_request_id
        }, (err, doc) => {
            if (err) throw err;
            // console.log(doc);
            if (doc) {
                res.send(JSON.stringify({
                    error: 0,
                    message: 'Payment Successfull',
                    payment_id: req.body.payment_id
                }));
            } else {
                res.send(JSON.stringify({
                    error: 1,
                    message: 'Payment Unsuccessfull'
                }));
            }
        })
    } else {
        res.status(400).write("Invalid Data");
        res.end();
    }
});

app.get('/login', (req, res) => {
    const db = req.app.locals.db,
        teamsList = db.collection('teamsList');
    if (req.headers.login_name == "dota2lan" && req.headers.password == "dota2lancomp") {
        teamsList.find({}).toArray((err, data) => {
            if (err) throw err;
            res.send({
                error: 0,
                data: data
            })
        })
    } else {
        res.status(400).write('Bad Login');
        res.end();
    }
});
app.listen(PORT, (err) => {
    if (err) throw err;
    process.stdout.write(`Server Started on ${PORT}
`);
})