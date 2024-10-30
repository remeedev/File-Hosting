# File Hoster

## Usage Instructions
1. Install all of the files in this repo alongside it's dependencies with
```
mkdir fileHoster
cd fileHoster
git clone https://github.com/remeedev/File-Hosting.git
```

```
npm install
```

2. Create a .env file where you will save the SESSION SECRET
```
echo SESSION_SECRET="(your session secret)" > .env
```

3. Run the file, if an sql error presents rerun the file

```
node index.js
```

4. Enjoy the File Hoster

## Concept:
A working local file hoster, to be accessed by any device with a login to the server, hosts files with a capacity of the capacity of the hard drive of the server, access to management systems, all accounts must be approved by a admin account. Limited file system capacities (read, write, modify) for users in groups.

## Functions:
- working sign in system & login 
- File viewing system
- Changing user settings (e.g. username, password)
- Edit files
- Delete files
- Going in and out of folders
- Permissions
- Add and delete folders
- Drag in files
- Upload and create file buttons amongst file views.
- Unblock blocked accounts as admin
- Delete accounts as admin and self as user
- Full view of logs, users and user groups in the admin panel
- User deletion is registered in the file log with a path of users:{id}
- Add, Edit, Delete User Groups
- Add and Delete file privileges as admin
- Modify accounts as admin
- Added availability for views in mobile devices 
