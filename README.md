![alt text](https://github.com/VergillR/rise-notifier-browser-extension-edge/blob/master/icons/riseicon_128.png "RISE logo extension")
# Introduction to extension apps
In order to get the latest information about the RISE network and RISE transactions, a RISE node acts as the data source to the outside world. A server could take the data from a RISE node and then either use this data for the content of the website itself (e.g. for statistics, voting or an online game) or expose the data to the outside world where it can be used for various purposes.
To the outside world, keeping track of transactions is one of the basic actions which brings us to our use case: extension apps.

Extension apps or extensions are add-ons for browsers which provide extra functions while the browser is open. In our case, they will provide notifications to users about incoming and outgoing transactions on the RISE network. In order to allow the extensions to work, a reliable data source is needed. Rather than having every browser directly burden a RISE node with requests, we are going to setup a data server/website which will collect data from the RISE node on behalf of all extensions.

### Summary
The code sets up a server and includes 2 parts:
- Functionality to support extensions, see *rise-listener-datasource.js* and *rise-pricewatch.js*
- Optional: Functionality to interact with the RISE API and RISE network via HTTP(S) GET requests, see *index.js* and [rise-server-api](https://github.com/VergillR/rise-server-api)

### Setup
This repo code sets up a simple NodeJS Express server which will listen to a default RISE node and act as a data source for our extensions.

The site can be reviewed and ran locally by downloading or cloning the repo:

`git clone https://github.com/VergillR/rise-get-latest-transactions/`

and then navigate to the directory just created and type `npm install` in the command prompt or terminal followed by `npm run start`.

Then open a browser, and type in the address bar **localhost:3000**

You can add customizations anywhere in the code (e.g. if you have your own RISE node, use that instead of the default RISE data node or add your own functions).

### Extensions
The extensions can be reviewed and installed from GitHub:

Extension for Google Chrome and other Chromium-based browsers (e.g. Opera, Vivaldi, etc.): [click here](https://github.com/VergillR/rise-notifier-browser-extension)

Extension for Mozilla Firefox: [click here](https://github.com/VergillR/rise-notifier-browser-extension-firefox)

Extension for Microsoft Edge: [click here](https://github.com/VergillR/rise-notifier-browser-extension-edge)

### Testing
**As data source for the extensions:**

If the server can be accessed by https from the outside, then you can immediately test it with one of the extensions. Go to the Options screen of the browser extension (by right-clicking the extension's icon and then selecting 'Options', 'Manage' or 'Manage Extension'). At the bottom of the Options Screen you can add another data source to the extension. Enter your website's url, save the change and see what happens. If it did not work, a notification with "Connection Error" will appear. Else, everything should work like normal.

**As interface for the RISE API:**

Type in your browser **localhost:3000/rise/api/transactions/getUnconfirmedTransactions**. You should get a JSON with the property **"success"** set to **true** as well as the properties **"count"** and **"transactions"**.

### Security
The data website as well as the RISE node should only allow https and have a valid SSL-certificate for safe communication. Unknown or untrusted websites and nodes should not be used by the extension apps.

Also, if the information is critical then transactions should be double-checked (e.g. getting confirmation from another RISE node directly or manually checking the block explorer).
