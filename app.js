const webPush = require('web-push');
const restify = require('restify');
const builder = require('botbuilder');
const fs = require('fs');

const vapidKeyFilePath = "./vapidKey.json";
var vapidKeys = {};

if (fs.existsSync(vapidKeyFilePath)) {
    //if the vapid file exists, then we try to parse its content 
    //to retrieve the public and private key.
    try {
        vapidKeys = JSON.parse(fs.readFileSync(vapidKeyFilePath));
    }
    catch (e) {
        console.error("There is an error with the vapid key file. Log: " + e.message);
        process.exit(-1);
    }
}
else {
    //If the file did not exist, we use the web-push module to create keys
    //and store them in the file for future use.
    //You should copy the public key in the index.js file
    vapidKeys = webPush.generateVAPIDKeys();
    fs.writeFileSync(vapidKeyFilePath, JSON.stringify(vapidKeys));
    console.log("No vapid key file found. One was generated. Here is the public key: " + vapidKeys.publicKey);
}

//Here we setup the web-push module for it to be able to
//send push notifications using our public and private keys:
webPush.setVapidDetails(
    'mailto:example@yourdomain.org',
    vapidKeys.publicKey,
    vapidKeys.privateKey);

//Standard way of creating a REST API for a bot:
var server = restify.createServer();
server.use(restify.bodyParser());

server.listen(process.env.port || process.env.PORT || 443, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

// Serve the embded HTML chat bot on our index.html page. Users will interact w/ the bot there.
// Look in the web folder and grab the index.html page
server.get(/\/?.*/, restify.serveStatic({
    directory: './web',
    default: 'index.html'
}));

//=========================================================
// Bots Dialogs
//=========================================================

//This is a 'dictionary' in which we store every push subscription per user.
var pushPerUser = [];

//This event handler is looking for every message sent by the bot.
//We look into the dictionary to see if we have push subscription info
//for this user, and we send a push notif with the bot message.
//This will keep sending the message to the user through the channel.
bot.on("outgoing", function (message) {
    if (pushPerUser && pushPerUser[message.address.user.id]) {
        var pushsub = pushPerUser[message.address.user.id];

        webPush.sendNotification({
            endpoint: pushsub.endpoint,
            TTL: "1",
            keys: {
                p256dh: pushsub.key,
                auth: pushsub.authSecret
            }
        }, message.text);
    }
});

//here we handle incoming "events" looking for the one which might come from 
//the backchannel. we add or replace the subscription info for this specific user
bot.on("event", function (message) {
    if (message.name === "pushsubscriptionadded") {
        pushPerUser[message.user.id] = message.value;
    }
});

//here is a classic way of greeting a new user and explaining how things work
bot.on('conversationUpdate', function (message) {
    if (message.membersAdded) {
        message.membersAdded.forEach(function (identity) {
            if (identity.id === message.address.bot.id) {
                var reply = new builder.Message()
                    .address(message.address)
                    .text('Greetings, human! I am a webchat notficiaton bot using the WebChat control! Say **"hello"** and I will send a message every 5 seconds. If you accepted notifications, you will get one! If you close the tab but leave the browser opened, you will get a notification when I talk. Oh, and say **"stop"** to shut me off :)');
                bot.send(reply);
            }
        });
    }
});


//This part is a very simple way of simulating proactive dialogs.
//We only send a message with an integer that we increment every 5 seconds.
//This is for push notifications test purposes and should not
//be use as base to create any real life bot. :)
var loop = false;
var count = 1;
bot.dialog('/', function (session) {
    if (session.message.text === "stop") {
        session.send("Stopping loop");
        loop = false;
    }
    else if (!loop) {
        loop = true;
        count = 1
        proactiveEmulation(session);
    }
});

var proactiveEmulation = (session) => {
    if (loop) {
        session.send(`Hello, I am a web push notification! :) (${count++})`);
        setTimeout(() => proactiveEmulation(session), 5000);
    }
};

//we use this to serve the webchat webpage 
server.get(/\/web\/?.*/, restify.serveStatic({
    directory: __dirname
}));