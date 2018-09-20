# Introduction
In order to get the latest information about the RISE network and RISE transactions, a RISE node acts as the data source to the outside world.

A website could take the data from a RISE node and then either use this data for the content of the website itself (e.g. for statistics, voting or an online game) or expose the data to the outside world where it can be used for various purposes.
To the outside world, keeping track of transactions is one of the basic actions which brings us to our use case: extension apps.

Extension apps or extensions are add-ons for browsers which provide extra functions while the browser is open. In our case, they will provide notifications to users about incoming and outgoing transactions. In order to allow the extensions to work a reliable data source is needed. Rather than having every browser directly burden a RISE node with requests, we are going to setup a data website which will collect data from the RISE node on behalf of all browsers.

# Setup
This repo code sets up a website which will listen to a default RISE node and act as a data source for our extensions. It runs a basic NodeJS Express server; index.js and getLatestRiseTransactions.js are loaded from the back-end (server side). (It should be possible to rewrite these files so they can be loaded from the front-end (client side))

The site can be reviewed and ran locally by simply cloning the repo:

`git clone https://github.com/VergillR/rise-get-latest-transactions/`

and then navigate to the directory just created and type `npm install` in the command prompt or terminal and then `npm run start`.

Then open a browser, and type in the address bar **localhost:3000**

You can add customizations anywhere in the code (e.g. if you have your own RISE node, use that instead of the default RISE data node or if you want to run your own functions and queries).

# Extensions
The extensions can be reviewed and installed from GitHub:

Extension for Google Chrome and other Chromium-based browsers (e.g. Opera, Vivaldi, etc.): [click here](https://github.com/VergillR/rise-notifier-browser-extension)

Extension for Firefox: [click here](https://github.com/VergillR/rise-notifier-browser-extension-firefox)

Extension for Microsoft Edge: [click here](https://github.com/VergillR/rise-notifier-browser-extension-edge)

# Testing
If you have setup a website with the code inside this repo and it can be accessed from the www, then you can actually immediately test it with one of the extensions. Go to the Options screen of the browser extension (by right-clicking the extension's icon and then selecting 'Options', 'Manage' or 'Manage Extension'). At the bottom of the Options Screen you can add another data source to the extension. Enter your website's url, save the change and see what happens. If it did not work, a notification with "Connection Error" will appear.

# Security
The data website as well as the RISE node should only allow https and have a valid SSL-certificate for safe communication. Unknown or untrusted websites and nodes should not be used by the extension apps.

Also, if the information is critical then transactions should be double-checked (e.g. getting confirmation from another RISE node directly or manually checking the block explorer).
