# Welcome to File Hoster!

This is the official release of file hoster, a locally ran file hoster, as its name implies.

## Expectations

The server was built to be stopped and be back up without any data loss, except for pre existing forms, this file is visible to all users that create an account.

## Manual

### Files and folders

You can drag in files to add them to the storage of the server, to make it clear there is no limit of file size to be uploaded by a user, this has to be managed directly by the admin, if you are the first account created then you are in luck, because that admin is you!\
\
The limit for files are specified by the storage space you allocate toward this server, it handles creation, edition, and edition of files for you!\
\
The creation of folders is pretty much similar to the creation of a file except you only give the folder name, and the server will take care of the rest.\
\
Sadly you can't upload an entire folder through this system but you can, instead create the folder and mass upload the folders contents into the file hoster.

### Safety of the users

All of the accounts that are created are saved inside the database which was created upon the first time you ran this program, it contains usernames, passwords and user IDs, users can't have repeating usernames. None of the passwords will be visible to the admin in any step of the way.\
\
If you are trying to create an account with a very weak password then the program will not allow you and will require for you to create a long, strong password to be used for your account.

### Permissions

By default, users are going to have only the read permission. But users can be put into user groups, the first account goes toward admin, and the rest goes toward default users, if you are an admin user and you just ran this program for the first time then you can find a file called hidden.txt which, guess what, even though all users start with read privileges that file can only be read like admins, because you can limit the access to a file through the admin panel if that is what you would like to do.\
\
You can also create new groups with certain access like only uploading files but not being able to see them, which wouldn't know why you would do that but it is possible.

### User settings

The profile icon that you see guides you towards you user settings, once you press it you will need to provide a password to change either the username or the password. If someone were able to change you username without you knowing would completely remove your access to your account.

### Admin Panel

If you are an admin and you want to manage and see everything luckily you are able to see everything from the admin panel, from there you can see and manage users as well as unblocking a user's account, which will automatically get blocked after three wrong attempts at a login, which will be registered in the login log, the file log will show you any action that was taken with a file, with file creation and file deletions being highlighted in red and green respectively, so that you can see whether an action was constructive or destructive.

Also in the login panel there are some highlights for which are succesful and which are unsuccesful attempts at a login, even though no action needs to be taken by you as a user you can still see whether there were a lot of login attempts (they will limit themselves for you at a max of 3) and in the case that an account got blocked from logging in you will be able to see and completely unblock it.

This is also a warning to you as an admin, don't let your account get blocked, because if you are the only admin then the privilege of taking care of all files and folders and users will go to nobody, so you should never, for any reason whatsoever lose your password, you can create a subsequent account and from the admin panel give yourself admin access and only use that account in the case that you got your account blocked. Furthermore if you want to check out an event done about your account suddenly dissapearing or any user for that matter, user deletions will also go inside of the file log for you to see.

Apart from that I guess there is nothing more than I can tell you reader, welcome to File Hoster and enjoy, in the case of any problem you can report it in the [github repo](https://github.com/remeedev/File-Hosting).

## Credits

This project was made by me, a dev who hasn't entered university but decided to take on a massive project, if you would like to donate to me you can by going to my twitch channel which I will leave right below

[![I am tired](https://panels.twitch.tv/panel-1144315845-image-5404fa3f-635c-4bee-9ce5-f65a237ae5b6)](https://streamlabs.com/remeedev/tip)
