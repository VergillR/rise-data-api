const express = require('express')
const path = require('path')
let app = express()
const publicPath = path.join(__dirname, 'public')
app.use(express.static(publicPath))
const port = process.env.PORT || 3000

/* rise-server-api brings the functionality of the RISE API to the server; it is a stand-alone module
 * Depending on whether the function needs single arguments (params) or a query object, HTTP(S) GET requests should be in the form:
 * /apilibrary/function
 * /apilibrary/function/params?param=100
 * /apilibrary/function/query?prop1=abc&prop2=10000&prop3=99999
 * For example:
 * /transactions/getUnconfirmedTransactions
 * /accounts/getBalance/params?address=7889374079483640385R
 * /transactions/getList/query?limit=50&senderId=7889374079483640385R&and:fromHeight=1318634&and:toHeight=1318834
*/
const RISE = require('rise-server-api')
const rise = new RISE({ basePathName: '/rise/api' })
app = rise.getExpressAppWithRiseAPI(app)

// rise-listener-datasource is optional and allows the server to act as a data source for extension apps; it can also show price information; it is a stand-alone module
const Listener = require('./rise-listener-datasource')
const listener = new Listener({ nodes: ['https://wallet.rise.vision'], pollTime: 90, autostart: true, checkOnStartup: true, enablePricewatch: true })
app = listener.getExpressAppWithListener(app)

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'))
})

app.get('*', (req, res) => {
  res.redirect('/')
})

app.listen(port, () => {
  console.log(`Started`)
})
