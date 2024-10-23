// Importing necessary modules
const express = require('express')
const app = express()
const port = 3000
const path = require('path')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt')
const sqlite = require('sqlite3').verbose();
const crypto = require("crypto")
const fileUpload = require("express-fileupload");
const qs = require("qs")
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

// Populate database if not yet populated
db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, passwordHash TEXT NOT NULL, user_group int)")
db.run("CREATE TABLE IF NOT EXISTS loginLog (userID int, time datetime, sessionID string, failed boolean)")
db.run("CREATE TABLE IF NOT EXISTS fileLog (file string, action int, userID int, time datetime)")
db.run("CREATE TABLE IF NOT EXISTS user_groups (id int, read int, write int, createP int, deleteP int)")
db.run("CREATE TABLE IF NOT EXISTS file_privilege (groupID int, file STRING, read int, write int, deleteP int)")
// Give admin all permissions
db.all("SELECT * FROM user_groups WHERE id = 0", (err, rows)=>{
    if (err) return err;
    if (rows.length == 0){
        db.run("INSERT INTO user_groups (id, read, write, createP, deleteP) VALUES (0, 1, 1, 1, 1)")
    }
})
// Give new users only read
db.all("SELECT * FROM user_groups WHERE id = 1", (err, rows)=>{
    if (err) return err;
    if (rows.length == 0){
        db.run("INSERT INTO user_groups (id, read, write, createP, deleteP) VALUES (1, 1, 0, 0, 0)")
    }
})

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
app.set('query parser', function (str) {
  return qs.parse(str, { /* custom options */ })
})
app.use(favicon(path.join(__dirname, 'static', 'icon.ico')))
app.use('/public', express.static(path.join(__dirname, 'static')))
app.set('view engine', 'ejs');
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(fileUpload());

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
// check for invalid request before logging admin
app.use(async (req, res, next)=>{
    if (req.method == "POST"){
        next()
        return
    }
    // redirect for all public files
    if (req.path.includes("/public/") && req.path.split("/")[1] != "public"){
        res.redirect("/p"+req.path.substring(req.path.indexOf("public")+1));
        return
    }
    // redirect for erases
    if (req.path.includes("/erase/") && req.path.split("/")[1] != "erase"){
        res.redirect("/e"+req.path.substring(req.path.indexOf("erase")+1));
        return
    }
    // redirect for modify 
    if (req.path.includes("/modify/") && req.path.split("/")[1] != "modify"){
        res.redirect("/m"+req.path.substring(req.path.indexOf("modify")+1));
        return
    }
    if (req.path != '/'){
        const count = await getData('SELECT COUNT(*) AS count FROM users');
        if (count[0].count == 0){
            res.redirect('/')
            return
        }
    }
    next()
})

// Function to get folders
const getDirectories = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

// Function to get files
const getFiles = source =>
  fs.readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isFile())
    .map(dirent => dirent.name)

// Process user request
async function processRequest(requestType, res, sessionID){
    let returnValue = {
        permission: sessionID != undefined,
        read: false,
        write: false,
        create: false,
        modify: false
    }
    const user_info = await getUserInfo(sessionID)
    if (returnValue.permission == false){
        return returnValue
    }
    const user_group = user_info[0].user_group;
    const user_limits = await getData("SELECT * FROM user_groups WHERE id = ?", user_group);
    returnValue.permission = user_limits.length != 0;
    if (returnValue.permission == false){
        return returnValue
    }
    if (requestType == 0){
        returnValue.permission = user_limits[0].read == 1;
    }
    if (requestType == 1){
        returnValue.permission = user_limits[0].write== 1;
    }
    if (requestType == 2){
        returnValue.permission = user_limits[0].createP == 1;
    }
    if (requestType == 3){
        returnValue.permission = user_limits[0].deleteP == 1;
    }
    returnValue.read = user_limits[0].read == 1;
    returnValue.write = user_limits[0].write == 1;
    returnValue.create = user_limits[0].createP == 1;
    returnValue.delete = user_limits[0].deleteP == 1;
    return returnValue
}

// Register action in file log
async function registerLog(action, path, sessionID){
    const userInfo = await getUserInfo(sessionID)
    const userID = userInfo[0].id;
    db.run("INSERT INTO fileLog (file, action, userID, time) VALUES (?, ?, ?, CURRENT_TIMESTAMP)", path, action, userID);
    return
}

// Get user information
async function getUserInfo(sessionID){
    const userInformation = await getData("SELECT users.* FROM users JOIN loginLog ON users.id = loginLog.userID WHERE sessionID = ? ORDER BY time DESC", sessionID);
    return userInformation;
}

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
                const usernames = await getUserInfo(req.session.id);
                const username = usernames[0].username;
                var files = [];
                var folders = [];
                var admin = usernames[0].user_group === 0
                const allowRead = await processRequest(0, res, req.session.id);
                if (allowRead.permission){
                    files = await getFiles(path.join(__dirname, "files"))
                    folders = await getDirectories(path.join(__dirname, "files"))
                }
                let params = {
                    username: username,
                    files: files,
                    folders: folders,
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

// Open subdirectories inside of storage
app.get('/path/:path(*)', async (req, res)=>{
    if (req.params.path == undefined || req.params.path == ""){
        res.redirect("/")
        return
    }
    if (req.session.id == undefined){
        res.redirect("/")
        return
    }
    const userInfo = await getUserInfo(req.session.id);
    const show = await processRequest(0, res, req.session.id)
    if (show == false) {
        res.redirect("/")
        return
    }
    var files = []
    var folders = []
    const username = userInfo[0].username;
    const admin = userInfo[0].user_group === 0
    const allowRead = await processRequest(0, res, req.session.id);
    if (allowRead.permission){
        try{
            files = await getFiles(path.join(__dirname, "files", req.params.path))
            folders = await getDirectories(path.join(__dirname, "files", req.params.path))
        }catch(error){
            res.redirect("/")
            return
        }
    }
    let params = {
        username: username,
        files: files,
        folders: folders,
        admin: admin,
        subfolder: true
    }
    res.render("files", params)
})

// log the user out
app.get('/logout', (req, res)=>{
    req.session.id = undefined
    req.session.alert = undefined
    res.redirect("/")
})

// Profile Webpage
app.get('/profile', async (req, res)=>{
    if (req.session.id){
        const usernames = await getUserInfo(req.session.id)
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

// Get a file upload
app.post("/fileUpload", async (req, res)=>{
    const allow = await processRequest(2, res, req.session.id);
    if (allow.permission == false){
        res.send({
            alert: "You are not allowed to upload files",
            alertType: 2
        })
        return
    }
    try{
        fs.writeFileSync(path.join(__dirname, "files", req.body.path, req.files.file.name), req.files.file.data);
        registerLog(2,path.join(req.body.path, req.files.file.name), req.session.id)
        res.send({
            alert: "Succesfully uploaded file!",
            alertType: 4
        })
        return
    } catch (error){
        res.send({
            alert: "There was an error uploading the file",
            alertType: 2
        })
        console.log(error)
        return
    }
})

// Delete folder
app.post("/delFolder", async (req, res)=>{
    const allow = await processRequest(3, res, req.session.id);
    if (allow.permission == false){
        res.send({
            alert: 'You are not allowed to delete folders',
            alertType: 2
        })
        return
    }
    let folder_path = path.join(__dirname, "files", req.body.path, req.body.folderName);
    if (!fs.existsSync(folder_path)){
        res.send({
            alert: "Folder does not exist",
            alertType: 2
        })
        return
    }
    try{
        fs.rmSync(folder_path, {recursive: true});
        res.send({
            alert: "Folder deleted",
            alertType: 4
        })
        return
    }catch (error){
        res.send({
            alert: 'There was an error',
            alertType: 2
        })
        return
    }
})

// Create new folder
app.post("/newFolder", async (req, res)=>{
    const allow = await processRequest(2, res, req.session.id);
    if (allow.permission == false){
        res.send({
            alert: 'You are not allowed to create a folder!',
            alertType: 2
        })
        return
    }
    if (fs.existsSync(path.join(__dirname, "files", req.body.path, req.body.folderName))){
        res.send({
            alert: "Folder with that name exists",
            alertType: 2
        })
        return
    }
    try{
        let folder_path = path.join(__dirname, "files", req.body.path, req.body.folderName)
        fs.mkdirSync(folder_path);
        res.send({
            alert: "Succesfully created!",
            alertType: 4
        })
        return
    }catch(error){
        res.send({
            alert: "There was an error",
            alertType: 2
        })
        console.log(error)
        return
    }
})

// Modify a file
app.get("/modify/:path(*)", async (req, res)=>{
    const allow = await processRequest(1, res, req.session.id);
    if (allow.permission == false){
        res.redirect("/")
        return
    }
    if (req.params.path == undefined || req.params.path == ""){
        res.redirect('/')
        return
    }
    let extension = req.params.path.split("/")
    extension = extension[extension.length - 1]
    extension = extension.split(".")
    extension = extension[extension.length - 1]
    if (extension == "png"){
        res.redirect("/")
        return
    }
    if (fs.existsSync(path.join(__dirname, "files", req.params.path))){
        const fileContent = fs.readFileSync(path.join(__dirname, "files", req.params.path))
        res.render("modify", {
            content: fileContent,
            filePath: req.params.path
        })
        return
    }
    res.redirect("/")
})

// Receive file changes
app.post("/modify", async (req, res)=>{
    const allow = await processRequest(1, res, req.session.id);
    if (allow == false){
        res.redirect("/")
    }
    let redirectURL = req.body.path.split("/")
    redirectURL.pop()
    redirectURL = redirectURL.join("/")
    if (fs.existsSync(path.join(__dirname, 'files', req.body.path))){
        fs.writeFileSync(path.join(__dirname, 'files', req.body.path), req.body.text);
        registerLog(1, req.body.path, req.session.id)
    }
    res.redirect("/path/" + redirectURL)
})

// Erase a file
app.get("/erase/:path(*)", async (req, res)=>{
    const allow = await processRequest(3, res, req.session.id)
    if (allow.permission == false){
        res.redirect("/")
        return
    }
    if (req.params.path == undefined || req.params.path == ""){
        res.redirect('/')
        return
    }
    let redirectPath = req.params.path.split("/")
    redirectPath.pop()
    if (fs.existsSync(path.join(__dirname, 'files',req.params.path))){
        fs.unlink(path.join(__dirname, 'files',req.params.path), (err)=>{
            if (err) return err
        })
        registerLog(3, req.params.path, req.session.id)
    }
    res.redirect(`/path/${redirectPath.join("/")}`)
})

// Change password
app.get('/password', async (req, res)=>{
    if (req.session.id){
        const passwords = await getUserInfo(req.session.id)
        const newpass = req.query.newpass
        const pw = req.query.pw
        if (newpass.length < 8 || newpass.length > 16){
            res.send({
                alert: "Password must be between 8 and 16 characters",
                alertType: 2
            })
            return
        }
        if (newpass == newpass.toLowerCase() || /\d/.test(newpass) != true || /[!@@$#%&^/?><.,;:'"\|`~(*)_+=-]/.test(newpass) != true){
            // Checking for password to fit security standards
            res.send({
                alert: "Passwords need an uppercase letter, a special character and a number",
                alertType: 2
            })
            return
        }
        const passwordHash = passwords[0].passwordHash
        const pwRight =await comparePw(pw, passwordHash);
        if (pwRight){
            await bcrypt.genSalt(saltRounds, async (err, salt)=>{
                if (err) return err;
                await bcrypt.hash(pw, salt, async (err, hash)=>{
                    if(err) return err;
                    db.run("UPDATE users SET passwordHash = ? WHERE id = ?", hash, passwords[0].id);
                })
            })
            res.send({
                alert: "Succesfully Changed password",
                alertType: 4
            })
            return
        }else{
            res.send({
                alert: "Wrong password!",
                alertType: 2
            })
        }
    }else{
        res.redirect("/")
    }
})

// Change username
app.get('/username', async (req, res)=>{
    if (req.session.id){
        const passwords = await getUserInfo(req.session.id)
        const username = req.query.username
        if (username.length < 3 || username.length > 15){
            res.send({
                alert: "Username must be between 3 and 15 characters",
                alertType: 2
            })
            return
        }
        const pw = req.query.password
        const passwordHash = passwords[0].passwordHash
        const pwRight = await comparePw(pw, passwordHash);
        if (pwRight){
            db.run("UPDATE users SET username = ? WHERE id = ?", username, passwords[0].id);
            res.send({
                alert: "Succesfully Changed username",
                alertType: 4
            })
            return
        }else{
            res.send({
                alert: "Wrong password!",
                alertType: 2
            })
        }
    }else{
        res.redirect("/")
    }
})

// Open admin panel as admin
app.get('/admin', async (req, res)=>{
    if (req.session.id){
        const usernames = await getUserInfo(req.session.id)
        const username = usernames[0].username;
        const admin = usernames[0].user_group === 0;
        if (admin == false){
            res.render("profile", {
                username: username,
                admin: admin,
                alert: "You do not have administrator privilege",
                alertType: 2
            })
            return
        }
        res.render("admin", {
            username: username,
            admin: admin
        })
    }else{
        res.redirect('/')
    }
})

// Return raw file 
app.get('/raw/:fileName(*)', async (req, res)=>{
    const give = await processRequest(0, res, req.session.id);
    if (give.permission == false){
        return
    }
    try {
        let content = fs.readFileSync(path.join(__dirname, "files", req.params.fileName));
        res.write(content);
        registerLog(0, req.params.fileName.slice(1), req.session.id);
    }catch (error){
        console.log(error)
        res.send('')
        return
    }
})

// Get requests for a file 
app.get('/file/:fileName(*)', async (req, res)=>{
    const give = await processRequest(0, res, req.session.id);
    if (give.permission == false) return
    let returnDict = {}
    try{
        let content = fs.readFileSync(path.join(__dirname, 'files', req.params.fileName));
        returnDict = {
            content: content.toString(),
            erase: give.delete,
            modify: give.write
        }
        registerLog(0, req.params.fileName.slice(1), req.session.id);
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

