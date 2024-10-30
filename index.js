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
    // Populate database if not yet populated
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, passwordHash TEXT NOT NULL, user_group int)")
    db.run("CREATE TABLE IF NOT EXISTS loginLog (userID int, time datetime, sessionID string, failed boolean)")
    db.run("CREATE TABLE IF NOT EXISTS fileLog (file string, action int, userID int, time datetime)")
    db.run("CREATE TABLE IF NOT EXISTS user_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, read int, write int, createP int, deleteP int)")
    db.run("CREATE TABLE IF NOT EXISTS file_privilege (id INTEGER PRIMARY KEY AUTOINCREMENT, groupID int, file STRING, read int, write int, deleteP int)")
    // Give admin all permissions
    db.all("SELECT * FROM user_groups", (err, rows)=>{
        if (err) console.log(err);
        if (rows.length == 0){
            db.run("INSERT INTO user_groups (id, read, write, createP, deleteP) VALUES (0, 1, 1, 1, 1)")
            db.run("INSERT INTO user_groups (read, write, createP, deleteP) VALUES (1, 0, 0, 0)")
        }
    })
    db.all("SELECT * FROM file_privilege", (err, rows)=>{
        if (err) return err;
        if (rows.length == 0){
            db.run("INSERT INTO file_privilege (groupID, file, read, write, deleteP) VALUES (0, 'hidden.txt', 1, 1, 1)")
        }
    })
});



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
        for (const l in req.body){
            req.body[l] = req.body[l].split('%20').join(' ')
        }
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

// Check for specific file privileges
async function checkFilePrivilege(groupID, path, action){
    if (groupID == 0)return true;
    try{
        const existence = await getData("SELECT * FROM file_privilege WHERE file=?", path);
        const whitelist = await getData(`SELECT * FROM file_privilege WHERE groupID = ? AND file = ? AND ${action}=1`, [groupID, path])
        return (existence.length == 0 || whitelist.length > 0);
    }catch(error){
        console.log(error)
    }
    return false;
}

// Process user request
async function processRequest(requestType, res, sessionID, path=undefined){
    let returnValue = {
        permission: sessionID != undefined,
        read: false,
        write: false,
        create: false,
        modify: false
    }
    if (returnValue.permission == false){
        return returnValue
    }
    const user_info = await getUserInfo(sessionID)
    if (path != undefined){
        returnValue.permission = await checkFilePrivilege(user_info[0].user_group, path, ["read", "write", 'deleteP'][requestType == 3 ? 2 : requestType])
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

// Main webpage, handles all connections
app.get('/', async (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users WHERE user_group = 0", async (err, row)=>{
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
                    let _files = getFiles(path.join(__dirname, "files"))
                    let _folders = getDirectories(path.join(__dirname, "files"))
                    const action = "read"
                    for (let i = 0; i < _files.length; i++){
                        const whitelisted = await checkFilePrivilege(usernames[0].user_group, _files[i], action);
                        if (whitelisted){
                            files.push(_files[i])
                        }
                    }
                    for (let i = 0; i < _folders.length; i++){
                        const whitelisted = await checkFilePrivilege(usernames[0].user_group, _folders[i], action);
                        if (whitelisted){
                            folders.push(_folders[i])
                        }
                    }
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
            let _files = getFiles(path.join(__dirname, "files", req.params.path))
            let _folders = getDirectories(path.join(__dirname, "files", req.params.path))
            const action = "read"
            for (let i = 0; i < _files.length; i++){
                const whitelisted = await checkFilePrivilege(userInfo[0].user_group, path.join(req.params.path, _files[i]), action);
                if (whitelisted){
                    files.push(_files[i])
                }
            }
            for (let i = 0; i < _folders.length; i++){
                const whitelisted = await checkFilePrivilege(userInfo[0].user_group, path.join(req.params.path, _folders[i]), action);
                if (whitelisted){
                    folders.push(_folders[i])
                }
            }
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
    const allow = await processRequest(3, res, req.session.id, path);
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
        registerLog(3, path.join(req.body.path, req.body.folderName, "/"),req.session.id)
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
        registerLog(2, path.join(req.body.path, req.body.folderName, '/'),req.session.id)
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
    const allow = await processRequest(1, res, req.session.id, req.params.path);
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
    const allow = await processRequest(1, res, req.session.id, req.body.path);
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
    const allow = await processRequest(3, res, req.session.id, req.params.path);
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
app.post('/password', async (req, res)=>{
    if (req.session.id){
        const passwords = await getUserInfo(req.session.id)
        const newpass = req.body.newpass
        const pw = req.body.pw
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
            bcrypt.genSalt(saltRounds, async (err, salt)=>{
                if (err) return err;
                bcrypt.hash(newpass, salt, async (err, hash)=>{
                    if(err) return err;
                    db.run("UPDATE users SET passwordHash = ? WHERE id = ?", hash, passwords[0].id);
                    res.send({
                        alert: "Succesfully Changed password",
                        alertType: 4
                    })
                })
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
app.post('/username', async (req, res)=>{
    if (req.session.id){
        const passwords = await getUserInfo(req.session.id)
        const username = req.body.username
        if (username.length < 3 || username.length > 15){
            res.send({
                alert: "Username must be between 3 and 15 characters",
                alertType: 2
            })
            return
        }
        const checker = await getData("SELECT * FROM users WHERE username = ?", username);
        if (checker.length > 0){
            res.send({
                alert: "Username already in use",
                alertType: 2
            })
            return
        }
        const pw = req.body.password
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
            return
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
        // Get all of the data that is given to an admin
        const users = await getData("SELECT id, username, user_group FROM users;");
        const user_groups = await getData("SELECT * FROM user_groups");
        const fileLog = await getData("SELECT * FROM fileLog ORDER BY time DESC");
        const loginLog = await getData("SELECT * FROM loginLog ORDER BY time DESC");
        const file_privileges = await getData("SELECT * FROM file_privilege");
        res.render("admin", {
            username: username,
            admin: admin,
            users: users,
            user_groups: user_groups,
            fileLog: fileLog,
            loginLog: loginLog,
            file_privilege: file_privileges
        })
    }else{
        res.redirect('/')
    }
})

// Return raw file 
app.get('/raw/:fileName(*)', async (req, res)=>{
    const give = await processRequest(0, res, req.session.id, req.params.fileName);
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
    if (req.session.id == undefined){
        res.redirect('/login')
    }
    const give = await processRequest(0, res, req.session.id, req.params.fileName);
    if (give.permission == false){
        res.send({
            content: 'You are not allowed to read this file'
        })
        return
    } 
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
            const count = await getData("SELECT COUNT(*) AS count FROM users WHERE user_group = 0");
            db.get("INSERT INTO users (username, passwordHash, user_group) VALUES (?, ?, ?)", username, hash, count[0].count == 0 ? 0 : 1, (err, row)=>{
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

// Function that unblocks account of user
app.get('/unblockAccount', async (req, res)=>{
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    let userInfo = await getUserInfo(req.session.id);
    userInfo = userInfo[0];
    const id = req.query.userID;
    if (id == undefined){
        res.send({alert:"A user id must be given", alertType: 2})
        return
    }
    if (userInfo.user_group == 0){
        try{
            await getData("INSERT INTO loginLog (userID, time, failed) VALUES (?, CURRENT_TIMESTAMP, ?)", [id, 0])
            res.send({
                alert: 'Succesfully unblocked account',
                alertType: 4
            })
            return
        } catch(error){
            console.log(error)
            res.send({
                alert: 'There was an error unblocking Account',
                alertType: 2
            })
            return
        }
    }else{
        res.send({
            alert: 'You are not allowed to unblock an account!',
            alertType: 2
        })
    }
})

// Function to delete the user
app.get('/delUser', async (req, res)=>{
    if (req.session.id == undefined){
        res.redirect("/login");
        return
    }
    let userInfo = await getUserInfo(req.session.id);
    userInfo = userInfo[0];
    var id = req.query.userID;
    if (id == undefined){
        id = userInfo.id;
    }else{
        if (userInfo.user_group != 0){
            res.send({
                alert: "You are not allowed to delete users!",
                alertType: 2
            })
            return
        }
    }
    try{
        let userDeleted = await getData("SELECT username FROM users WHERE id = ?", id);
        if (userDeleted.length == 0){
            res.send({
                alert: 'User does not exist',
                alertType: 2
            })
            return
        }
        await registerLog(3, "users:"+userDeleted[0].username, req.session.id)
        await getData("DELETE FROM users WHERE id = ?", id);
        res.send({
            alert: "Succesfully deleted user",
            alertType: 4
        })
        return
    }catch(error){
        res.send({
            alert: "There was an error deleting the user",
            alertType: 2
        })
        return
    }
})

// Function to edit the user info as admin
app.get('/editUserInfo', async (req, res)=>{
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    const userInfo = await getUserInfo(req.session.id);
    // Admin shouldn't need to go admin panel to change his username and can't demote himself
    if (userInfo[0].user_group != 0){
        res.send({
            alert: 'Only an admin may edit users information',
            alertType: 2
        })
    }
    const userGroup = req.query.userGroup;
    const username = req.query.username;
    const userID = req.query.userID;
    if (((userGroup == undefined || userGroup == '') && (username == undefined || username=="")) || userID == undefined){
        res.send({
            alert: "userID must be given along with a username or a user group",
            alertType: 2
        })
        return
    }
    if (username.length < 3 || username.length > 15){
        res.send({
            alert: "Username must be between 3 and 15 characters",
            alertType: 2
        })
        return
    }
    if (userInfo[0].id == userID){
        res.send({
            alert: "Go to account tab to change your information, demoting yourself is not available",
            alertType: 2
        })
        return
    }
    try {
        const user_group = await getData("SELECT * FROM user_groups WHERE id = ?", userGroup)
        if (user_group.length == 0){
            res.send({
                alert: "That user group does not exist",
                alertType: 2
            })
            return
        }
        const otherPerson = await getData("SELECT * FROM users WHERE id = ?", userID);
        if (otherPerson.length == 0){
            res.send({
                alert:"User does not exist",
                alertType: 2
            })
            return
        }
        const check = await getData("SELECT * FROM users WHERE username = ?", username);
        if (check.length > 0){
            if (check[0].id != userID){
                res.send({
                    alert: "User with that username already exists",
                    alertType: 2
                })
                return
            }
        }
        if (username){
            await getData("UPDATE users SET username = ? WHERE id = ?", [username, userID])
        }
        if (userGroup){
            await getData("UPDATE users SET user_group = ? WHERE id = ?", [userGroup, userID])
        }
        res.send({
            alert: "Changes submitted succesfully",
            alertType: 4
        })
        return
    }catch(error){
        res.send({
            alert: "There was an error while saving",
            alertType: 2
        })
        return
    }
})

// Add file privilege
app.post('/addPrivilege', async(req, res)=>{
    if (!req.body.path){
        res.send({
            alert: "A path must be given",
            alertType: 2
        })
        return
    }
    if (!req.body.userGroup || isNaN(+req.body.userGroup)){
        res.send({
            alert: "A user group must be given",
            alertType: 2
        })
        return
    }
    try {
        await getData("INSERT INTO file_privilege (groupID, file, read, write, deleteP) VALUES (?, ?, ?, ?, ?)", [req.body.userGroup, req.body.path, +(req.body.read == 'true'), +(req.body.write == 'true'), +(req.body.delete == 'true')])
        res.send({
            alert: "Added Succesfully",
            alertType: 4
        })
        return
    }catch(error){
        res.send({
            alert:"There was an error creating the privilege",
            alertType: 2
        })
        return
    }
})

// Delete file privilege
app.get('/deleteFilePrivilege', async (req, res)=>{
    const id = req.query.id;
    if (!id){
        res.send({
            alert: "you need to give an ID",
            alertType: 2
        })
        return
    }
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    const userinfo = await getUserInfo(req.session.id);
    if (userinfo[0].user_group != 0){
        res.send({
            alert: "You need to be an admin to delete a privilege",
            alertType: 2
        })
        return
    }
    try {
        await getData("DELETE FROM file_privilege WHERE id = ?", [id])
        res.send({
            alert: "Succesfully deleted",
            alertType: 4
        })
        return
    }catch(error){
        console.log(error)
        res.send({
            alert: "there was an error deleting",
            alertType: 2
        })
        return
    }
})

// Delete user group
app.get('/deleteUserGroup', async (req, res)=>{
    const groupID = req.query.id;
    if (!groupID){
        res.send({
            alert: "you need to give a group ID",
            alertType: 2
        })
        return
    }
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    const userinfo = await getUserInfo(req.session.id);
    if (userinfo[0].user_group != 0){
        res.send({
            alert: "You need to be an admin to delete a group",
            alertType: 2
        })
        return
    }
    try {
        await getData("DELETE FROM user_groups WHERE id = ?", [groupID])
        db.run("UPDATE users SET user_group = 1 WHERE user_group = ?", groupID)
        res.send({
            alert: "User group succesfully deleted",
            alertType: 4
        })
        return
    }catch(error){
        console.log(error)
        res.send({
            alert: "there was an error deleting the group",
            alertType: 2
        })
        return
    }
})

// Create user group
app.get('/createUserGroup', async (req, res)=>{
    const read = +!isNaN(+req.query.read);
    const write = +!isNaN(+req.query.write);
    const create = +!isNaN(+req.query.create);
    const deleteP = +!isNaN(+req.query.delete);
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    const userinfo = await getUserInfo(req.session.id);
    if (userinfo[0].user_group != 0){
        res.send({
            alert: "You need to be an admin to create a group",
            alertType: 2
        })
        return
    }
    try {
        await getData("INSERT INTO user_groups (read, write, createP, deleteP) VALUES (?, ?, ?, ?)", [read, write, create, deleteP])
        res.send({
            alert: "User group succesfully created",
            alertType: 4
        })
        return
    }catch(error){
        console.log(error)
        res.send({
            alert: "there was an error creating the group",
            alertType: 2
        })
        return
    }
})

// Edit user group
app.get('/editUserGroup', async (req, res)=>{
    const groupID = req.query.groupID;
    if (!groupID){
        res.send({
            alert: 'No group ID was given',
            alertType: 2
        })
        return
    }
    if (groupID == 0 || groupID == 1){
        res.send({
            alert: "Cannot edit admin or default group privileges",
            alertType: 2
        })
        return;
    }
    const read = +!isNaN(+req.query.read);
    const write = +!isNaN(+req.query.write);
    const create = +!isNaN(+req.query.create);
    const deleteP = +!isNaN(+req.query.delete);
    if (req.session.id == undefined){
        res.redirect("/login")
        return
    }
    const userinfo = await getUserInfo(req.session.id);
    if (userinfo[0].user_group != 0){
        res.send({
            alert: "You need to be an admin to edit a group",
            alertType: 2
        })
        return
    }
    try {
        await getData("UPDATE user_groups SET read = ?, write= ?, createP=?, deleteP=? WHERE id=?", [read, write, create, deleteP, groupID])
        res.send({
            alert: "User group succesfully edited",
            alertType: 4
        })
        return
    }catch(error){
        console.log(error)
        res.send({
            alert: "there was an error editing the group",
            alertType: 2
        })
        return
    }
})

// Login post and get requests
app.get('/login', (req, res)=>{
    if (req.session.id != undefined){res.redirect('/')}
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
            if (recentLogins[0].failed === 1 && recentLogins[1].failed === 1 && recentLogins[2].failed === 1 ){
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
            db.get("INSERT INTO loginLog (userID, time, failed) VALUES (?, CURRENT_TIMESTAMP, ?)", user.id, true, (err, row)=>{
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

// Starts app
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

