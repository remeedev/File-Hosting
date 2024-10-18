// Importing necessary modules
const express = require('express')
const app = express()
const port = 3000
const path = require('path')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const sqlite = require('sqlite3').verbose();
const crypto = require("crypto")
var cookieSession = require('cookie-session');
var favicon = require("serve-favicon")
const fs = require("fs")
require("dotenv").config()

const saltRounds = 13

// Access the database
let db = new sqlite.Database('./users.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the my database.');
});

db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, passwordHash TEXT NOT NULL, user_group int)")
db.run("CREATE TABLE IF NOT EXISTS loginLog (userID int, time datetime, sessionID string, failed boolean)")
db.run("CREATE TABLE IF NOT EXISTS fileLog (file string, action int, userID int, time datetime)")

// Function to compare passwords asynchronously
const comparePw= (password, hash) => {
    return new Promise((resolve, reject) => {
        bcrypt.compare(password, hash, (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
};

// Function to get database values asynchronously

const getData = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows);
        });
    });
};

// Setting application values
app.use(favicon(path.join(__dirname, 'static', 'icon.ico')))
app.use('/public', express.static(path.join(__dirname, 'static')))
app.set('view engine', 'ejs');
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieSession({
    name: 'session',
    secret: process.env.SESSION_SECRET,
    saveUninitialized: true,
    resave: false,
    cookie: {
        maxAge: 30*24*60*60*1000,
        secure: true,
        httpOnly: true
    }
}))

// Main webpage, handles all connections
app.get('/', async (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users", async (err, row)=>{
        if (err) return err;
        if (row.count == 0){
            res.render('signin', {
                alert: "You are creating an admin account.",
                alertType: 1
            });
        }else{
            if (req.session.id){
                const usernames = await getData("SELECT users.username, users.user_group FROM users JOIN loginLog ON users.id = loginLog.userID WHERE sessionID = ? ORDER BY time DESC", req.session.id);
                const username = usernames[0].username;
                var files = [];
                var admin = usernames[0].user_group === 0
                if (admin){
                    files = fs.readdirSync("./files")
                }
                let params = {
                    username: username,
                    files: files,
                    admin: admin
                }
                if (req.session.alert){
                    params.alert = "Succesfully logged in"
                    params.alertType = 4
                    req.session.alert = false;
                }
                res.render("files", params)
                return
            }
            res.redirect('/login');
        }
    })
})

app.get('/logout', (req, res)=>{
    req.session.id = undefined
    req.session.alert = undefined
    res.redirect("/")
})

// Profile Webpage
app.get('/profile', async (req, res)=>{
    if (req.session.id){
        const usernames = await getData("SELECT users.username, users.user_group FROM users JOIN loginLog ON users.id = loginLog.userID WHERE sessionID = ? ORDER BY time DESC", req.session.id);
        const username = usernames[0].username;
        const admin = usernames[0].user_group === 0;
        res.render('profile', {
            username: username,
            admin: admin
        })
    }else{
        res.redirect('/')
    }
})

// Return raw file 
app.get('/raw/:fileName', async (req, res)=>{
    try {
        let content = fs.readFileSync(path.join(__dirname, "files", req.params.fileName));
        res.write(content);
    }catch (error){
        console.log(error)
        res.send('')
        return
    }
})

// Get requests for a file 
app.get('/file/:fileName', async (req, res)=>{
    let returnDict = {}
    try{
        let content = fs.readFileSync(path.join(__dirname, 'files', req.params.fileName));
        returnDict = {
            content: content.toString()
        }
    } catch(error){
        returnDict = {
            content: "There was an error",
            error: true
        }
    }
    res.send(returnDict)
    return ;
})

// Signin post and get request handling
app.get('/signin', (req, res)=>{
    res.render('signin');
})

app.post('/signin', async (req, res)=>{
    const username = req.body.username;
    const password = req.body.password;
    const repeat = req.body.repeat;
    if (username == "" || password == "" || repeat == "") { // Checking for blank values
        res.render('signin', {
            alert:"cannot leave blank entries.",
            alertType: 2
        })
        return
    }
    if (password != repeat){ // Checking for password and repeat not being the same
        res.render('signin', {
            alert: "Passwords do not match",
            alertType: 2
        })
        return
    }
    if (username.length < 3 || username.length > 15){ // Checking for username length
        res.render('signin', {
            alert: "Username must be between 3 and 15 characters long",
            alertType: 2
        })
        return
    }
    if (password.length < 8 || password.length > 16){ // checking password length
        res.render('signin', {
            alert: "Password must be between 8 and 16 characters long",
            alertType: 2
        })
        return
    }
    if (password == password.toLowerCase() || /\d/.test(password) != true || /[!@@$#%&^/?><.,;:'"\|`~(*)_+=-]/.test(password) != true){
        // Checking for password to fit security standards
        res.render('signin', {
            alert: "Passwords need an uppercase letter, a special character and a number",
            alertType: 2
        })
        return
    }
    try {
        // Checking for unique username
        const data = await getData("SELECT COUNT(*) AS count FROM users WHERE username = ?", username);
        if (data[0].count != 0){
            res.render('signin', {
                alert: 'Account with same username exists!',
                alertType: 2
            })
            return
        }
    } catch (error) {
        res.redirect('/')
        return error;
    }
    // Adding user to databse
    bcrypt.genSalt(saltRounds, (err, salt)=>{
        if (err) return err;
        bcrypt.hash(password, salt, async (err, hash)=>{
            if(err) return err;
            const count = await getData("SELECT COUNT(*) AS count FROM users");
            await db.get("INSERT INTO users (username, passwordHash, user_group) VALUES (?, ?, ?)", username, hash, count[0].count == 0 ? 0 : 1, (err, row)=>{
                if (err) return err;
            })
        })
    })
    // Redirect to login upon account creation to log in to account
    res.render('login', {
        alert: "Account succesfully created",
        alertType: 4
    });
})

// Login post and get requests
app.get('/login', (req, res)=>{
    res.render('login');
})

app.post('/login', async (req, res)=>{
    const {username, password} = req.body;
    try {
        const users = await getData("SELECT id, passwordHash FROM users WHERE username=?", username);
        if (users.length === 0){
            res.render("login", {
                alert: 'User not found',
                alertType: 2
            })
            return
        }
        // Check if account is blocked
        const user = users[0] // equivalent to first row of query
        const recentLogins = await getData('SELECT failed FROM loginLog WHERE userID = ? ORDER BY time DESC', user.id);
        if (recentLogins.length > 2){
            if (recentLogins[0] === 1 && recentLogins[1] === 1 && recentLogins[2] === 1 ){
                res.render("login", {
                    alert: "This account has been disabled ask an admin account to log you in",
                    alertType: 2
                })
                return
            }
        }
        const result = await comparePw(password, user.passwordHash);
        if (result){
            let sessionID = crypto.randomBytes(64).toString("hex")
            req.session.id = sessionID;
            let userID = user.id
            let failed = false
            await getData("INSERT INTO loginLog (userID, time, sessionID, failed) VALUES (?, CURRENT_TIMESTAMP, ?, ?)", [userID, sessionID, failed]);
            req.session.alert = true;
            res.redirect("/");
            return 
        } else {
            await db.get("INSERT INTO loginLog (userID, time, failed) VALUES (?, CURRENT_TIMESTAMP, ?)", user.id, true, (err, row)=>{
                if(err) return err;
            })
        }
    } catch (error){
        res.status(500).send("An error occurred");
        return error;
    }
    
    res.render("login", {
        alert: "wrong username or password",
        alertType: 2
    })
    return
})

// Page restricted to logged in users, shows files
app.get('/files', (req, res)=>{
    
})

// Starts app
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

