// Import necessary requirements
var ws = require('ws');
var mysql = require("mysql");
modders = [];
const Twitchhelix = require("twitch-helix"); // Install this with apt-get
//var https = require("https");
var socket = new ws('wss://pubsub-edge.twitch.tv');

//con.query("CREATE DATABASE mydb", function (err, result) {
//if (err) throw err;

// Configurate database here
var con_config = {
    host: "",
    user: "",
    password: "",
    database: "",
    port: '/var/run/mysqld/mysqld.sock'
};


var con;


// Handeling disconnects from sockets or mysql
function handleDisconnect() {
    con = mysql.createConnection(con_config);

    con.connect(function (err) {              // The server is either down
        if (err) {                                     // or restarting (takes a while sometimes).
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
        }                                     // to avoid a hot loop, and to allow our node script to
    });                                     // process asynchronous requests in the meantime.
    // If you're also serving http, display a 503 error.
    con.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect();                         // lost due to either server restart, or a
        } else {                                      // connnection idle timeout (the wait_timeout
            throw err;                                  // server variable configures this)
        }
    });
}


handleDisconnect();


// In case the modder isn't in the database, create a table for it
function createModderLog(name) {
    var sql = mysql.format("CREATE TABLE `modLogger`.?? ( `person` VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL , `beaned` TINYINT(1) NOT NULL , `time` VARCHAR(255) NOT NULL , PRIMARY KEY (`time`)) ENGINE = InnoDB CHARSET=utf8 COLLATE utf8_general_ci;", [name]);
    con.query(sql, function (err, result) {
        if (err) throw err;
        console.log("Database created for: ", name);
    });
}


// Log a action in the relevant table
function insertAction(beaner, name, beaned, time) {
    var sql = mysql.format("INSERT INTO ?? (`person`, `beaned`, `time`) VALUES (?)", [beaner, [name, beaned, String(time)]]);
    con.query(sql, function (err, result) {
        if (err) throw err;
        console.log("Inserted user ", name, " into ", beaner);
    });
}


// Open socket
socket.on('open', function () {
    thing = socket.send(JSON.stringify({
        "type": "LISTEN",
        "nonce": "arandomstringLUL",
        "data": {
            "topics": ["chat_moderator_actions.72716534.32140000"], // Change numbers for own Twitch id's
            "auth_token": "" // Enter auth token here
        }
    }));
    //console.log(thing);
    setInterval(function () { // Ping the socket every so often to keep it from closing
        socket.send(JSON.stringify({
            type: "PING"
        }));
    }, 6000);
});

setInterval(function () {
    socket.ping();
}, 300000);

// Get all moderators from database
con.query("SHOW TABLES", function (err, result) {
    for (i = 0; i < result.length; i++) {
        modders.push(result[i].Tables_in_modLogger);
    }
    console.log(modders);
});

// Handle actions received over socket
socket.on('message', function (data) {
    data = JSON.parse(data);
    if (data["type"] === "MESSAGE") { // Parse messages to only look for bans and unbans
        messageMessage = JSON.parse(data["data"]["message"]);
        messageData = messageMessage["data"];
        //targetUser = getUserName(messageData["target_user_id"]);
        if (messageData["created_by"] !== "streamelements") {
            if (messageData["moderation_action"] === "ban" || messageData["moderation_action"] === "unban") {
                if (messageData["moderation_action"] === "ban") {
                    unban = true;
                }
                else {
                    unban = false;
                }
                var beaner = messageData["created_by"];
                var beaned = messageData["args"][0];
                var beanTime = new Date().toLocaleString();

                if (modders.includes(beaner) === true) {
                    insertAction(beaner, beaned, unban, beanTime); // Insert the found action
                }
                else {
                    createModderLog(beaner);
                    modders = [];
                    con.query("SHOW TABLES", function (err, result) {
                        for (i = 0; i < result.length; i++) {
                            modders.push(result[i].Tables_in_modLogger);
                        }
                    });
                    insertAction(beaner, beaned, unban, beanTime);
                    console.log(modders);
                }
            }
        }
        //console.log(messageData["created_by"] + " preformed action: " + messageData["moderation_action"] + " with the following arguments: " + messageData["args"]);
    }
});


const twitchApi = new Twitchhelix({ // Enter own twitch api id and secret here
    clientId: "",
    clientSecret: ""
});


function getUserName(userId) {
    twitchApi.getTwitchUserById(userId).then(twitchUser => {
        return twitchUser.display_name;
    });
}

/*
twitchApi.getTwitchUserByName("sypherpk").then(twitchUser => {
    console.log(twitchUser.id);
});
*/
socket.on('disconnected', onDisconnectedHandler); // Log the disconnect reason if the socket closes
function onDisconnectedHandler(reason) {
    console.log(`Disconnected: ${reason}`);
    process.exit(1);
}