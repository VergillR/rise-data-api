const express = require('express')
const rise = require('risejs').rise
const riseRegex = /^\d{15,30}R$/
let latestTransactions = JSON.stringify([])
let status = JSON.stringify({ message: 'No data available... System is not running...', 'last-blockheight-checked': 1 })
let lastNonEmptyTransactions = JSON.stringify(latestTransactions)

module.exports = class {
  /**
   * @constructor
   * @param {{ nodes: string[], pollTime: number, autostart: boolean, checkOnStartup: boolean, maxInitialBlocks: number, cycleNodesIfTooManyErrors: boolean,  errorTreshold: number, enablePricewatch: boolean, setupPricewatch: object, onTriggerCallback: function }} settings Creates the settings of the listener; also sets up the pricewatcher if needed
   */
  constructor ({ nodes = ['https://wallet.rise.vision'], pollTime = 90, autostart = true, checkOnStartup = false, maxInitialBlocks = 240, cycleNodesIfTooManyErrors = true, errorTreshold = 3, enablePricewatch = true, setupPricewatch = { source: 'https://api.coinmarketcap.com/v1/ticker/RISE/', minPollTime: 480, maxPollTime: 540, autostart: true, pricePathName: '/rise_prices' }, onTriggerCallback = this.onUpdate } = {}) {
    this.nodes = nodes
    this.nodeIndex = 0
    this.node = this.nodes[this.nodeIndex]
    rise.nodeAddress = this.node
    this.pollTime = pollTime
    this.maxInitialBlocks = maxInitialBlocks
    this.onTriggerCallback = onTriggerCallback

    // if an update() call fails consecutively and exceeds the error treshold, the active node is switched to the next one on the list of nodes; for more information, see the function handleUpdateError()
    this.cycleNodesIfTooManyErrors = cycleNodesIfTooManyErrors
    this.errorTreshold = errorTreshold
    this.consecutiveConnectionErrors = 0
    this.lowestPollTime = 30
    this.highestPollTime = 600
    this.lastTransactions = []
    this.previousLastTransactions = []
    this.lastNonEmptyTransactions = []
    this.lastBlockHeightChecked = 0
    this.lastTimeChecked = 0
    this.watcher = null

    if (enablePricewatch) {
      // Pricewatch is optional and used by extension apps; it is a stand-alone module
      // Pricewatch can be requested in app as: GET path /prices, which returns the priceJson object from pricewatch-rise.js; the default path name '/prices' can be changed in the setupPricewatch property of constructor ()
      this.pricewatcher = new (require('./rise-pricewatch'))(setupPricewatch)
    } else {
      this.pricewatcher = null
    }

    if (autostart) {
      this.run()
    }
    if (checkOnStartup) {
      this.update()
    }
  }

  /**
   * Sort transaction objects from the highest block height to the lowest block height
   * @param {{ height: number }} a Object containing all properties of a transaction, including the property height
   * @param {{ height: number }} b Object containing all properties of a transaction, including the property height
   */
  compare (a, b) {
    return b.height - a.height
  }

  /**
   * Fetches account info (and optionally delegate info) from a RISE node using the RISE API
   * @param {string[]} addresses Array of RISE addresses
   * @param {boolean} [includeDelegateInfo=false] Whether or not to also query delegate info
   * @param {function} [callback=()=>{}] Function to be called after the query was received
   */
  async fetchAccountInfo (addresses = [], includeDelegateInfo = false, callback = () => {}) {
    if (!Array.isArray(addresses) || addresses.length === 0) return []
    let j = 0
    const allInfo = [ null, null, null, null, null ]
    while (j < addresses.length) {
      try {
        const validAddress = addresses[j].match(/^\d{15,30}R$/)
        if (validAddress) {
          let resultAccounts = {}
          let resultDelegates = {}
          let resultRegistration = {}
          resultAccounts = await this.fetchAccountResult(addresses[j])
          if (includeDelegateInfo) {
            resultDelegates = await this.fetchDelegateResult(addresses[j])
            if (resultAccounts.account && typeof resultAccounts.account.publicKey === 'string') {
              resultRegistration = await this.fetchRegistrationResult(resultAccounts.account.publicKey)
            }
          }
          // the resulting object thus looks like { success: boolean, account: Object, delegates?: Object, delegate?: Object }
          allInfo[j] = Object.assign({}, resultAccounts, resultDelegates, resultRegistration)
        }
      } catch (e) {}
      j++
    }
    callback(allInfo)
  }

  /**
   * Retrieve the account info from the given RISE address; a non-existing RISE address will throw an error
   * @param {string} address RISE address
   */
  fetchAccountResult (address) {
    return new Promise((resolve, reject) => {
      rise.accounts.getAccount(address).then((data) => {
        resolve(data.success && data.account ? data : {})
      }).catch(() => { resolve({}) })
    })
  }

  /**
   * Retrieve the delegate info from the given RISE address; a non-existing RISE address will throw an error
   * @param {string} address RISE address
   */
  fetchDelegateResult (address) {
    return new Promise((resolve, reject) => {
      rise.accounts.getDelegates(address).then((data) => {
        resolve(data.success && data.delegates ? data : {})
      }).catch(() => { resolve({}) })
    })
  }

  /**
   * Retrieve registration info (e.g. the delegate and the username) by the given RISE public key; the RISE API gives an error if the address belonging to the public key has not registered a delegate/username, in which case an empty object is returned to the caller
   * @param {string} publicKey The public key of the RISE address
   */
  fetchRegistrationResult (publicKey) {
    return new Promise((resolve, reject) => {
      rise.delegates.getByPublicKey(publicKey).then((data) => {
        resolve(data.success && data.delegate ? data : {})
      }).catch(() => { resolve({}) })
    })
  }

  /**
   * Sends out all queries and collects all query results from the RISE node; response is given by calling the provided callback function
   * @param {number} type The requested type of transactions; 1 = all transactions, 2 = only incoming, 3 = only outgoing
   * @param {number} blockheight The block height to start the search from
   * @param {string[]} addresses Array containing the RISE addresses that are of interest
   * @param {function} callback Function to be called after the query was received
   */
  async fetchList (type = 1, blockheight = 1000, addresses = [], callback = () => {}) {
    // type 1 is all, 2 is only incoming, 3 is only outgoing
    return new Promise((resolve, reject) => {
      if (addresses.length === 0) resolve([])

      let queries = [ null, null, null, null, null ]
      for (let i = 0; i < addresses.length; i++) {
        queries[i] = {
          limit: 500,
          'and:fromHeight': blockheight,
          senderId: type !== 2 ? addresses[i] : undefined,
          recipientId: type !== 3 ? addresses[i] : undefined
        }
      }
      try {
        Promise.all([this.fetchQueryResult(queries[0]), this.fetchQueryResult(queries[1]), this.fetchQueryResult(queries[2]), this.fetchQueryResult(queries[3]), this.fetchQueryResult(queries[4])]).then((resultingArray) => resolve(callback(resultingArray.filter((el) => el.length > 0).sort(this.compare)))).catch((err) => { console.error(err); resolve([]) })
      } catch (err) {
        console.error(err)
        resolve([])
      }
    })
  }

  /**
   * Request transactions starting from the given block height till now for a given address
   * @param {{ 'and:fromHeight': number, senderId: string, recipientId: string }} query Query
   */
  fetchQueryResult (query) {
    return new Promise((resolve, reject) => {
      if (query === null) {
        resolve([])
      } else {
        rise.transactions.getList(query).then((data) => {
          resolve(data.transactions && data.transactions.length > 0 ? data.transactions : [])
        }).catch(() => { resolve([]) })
      }
    })
  }

  /**
   * Returns an Express app that acts as a data source which has access to certain functions of the RISE API and makes them available to be used by the outside world and extension apps; allows handling queries sent by extension apps by HTTP(S) GET; You can change the basePathName if a path should precede the listener paths (i.e. you do not want the listener paths to be attached directly to the main directory); if no Express app is given, a new one is created and returned
   * @param {function} app Express app
   * @param {string} [basePathName=''] Optional base path that precedes the listener paths
   */
  getExpressAppWithListener (app = express(), basePathName = '') {
    app.get(basePathName + '/rise_data', (req, res) => {
      res.send(JSON.stringify(status))
    })

    app.get(basePathName + '/rise_accounts', (req, res) => {
      this.sendAccountQuery(req, res)
    })

    app.get(basePathName + '/rise_fetchall', (req, res) => {
      this.sendOfflineMessagesQuery(req, res, 1)
    })

    app.get(basePathName + '/rise_fetchin', (req, res) => {
      this.sendOfflineMessagesQuery(req, res, 2)
    })

    app.get(basePathName + '/rise_fetchout', (req, res) => {
      this.sendOfflineMessagesQuery(req, res, 3)
    })

    app.get(basePathName + '/rise_latest_transactions', (req, res) => {
      res.send(JSON.stringify(latestTransactions))
    })

    app.get(basePathName + '/rise_last_nonempty_transactions', (req, res) => {
      res.send(JSON.stringify(lastNonEmptyTransactions))
    })

    if (this.pricewatcher) {
      return this.pricewatcher.getExpressAppWithPricewatcher(app, basePathName)
    } else {
      return app
    }
  }

  /**
   * Returns last transactions as JSON
   * @returns {JSON} JSON with last transactions
   */
  getJSON () {
    return JSON.stringify(this.lastTransactions)
  }

  /**
   * Returns poll time
   * @returns {number} Poll time in seconds
   */
  getPollTime () {
    return this.pollTime
  }

  /**
   * Gives the current system status
   * @returns {{ date: Date, message: string, node: string, polltime: number, 'last-blockheight-checked': number, 'last-time-checked': Date }}
   */
  getStatus () {
    return {
      date: new Date(),
      message: this.watcher !== null ? 'Service is active and running...' : 'Service is not active',
      node: this.node,
      polltime: this.pollTime,
      'last-blockheight-checked': this.lastBlockHeightChecked,
      'last-time-checked': this.lastTimeChecked
    }
  }

  /**
   * Returns last transactions
   * @returns {Object} Object containing latest transactions
   */
  getTransactions () {
    const resultObj = { success: true }
    const transactions1 = this.lastTransactions.transactions ? this.lastTransactions.transactions : []
    const transactions2 = this.previousLastTransactions.transactions ? this.previousLastTransactions.transactions : []
    resultObj.transactions = transactions1.concat(transactions2)
    const count1 = parseInt(this.lastTransactions.count, 10) ? parseInt(this.lastTransactions.count, 10) : 0
    const count2 = parseInt(this.previousLastTransactions.count, 10) ? parseInt(this.previousLastTransactions.count, 10) : 0
    resultObj.count = count1 + count2
    return resultObj
  }

  /**
   * Logs the update error and if necessary, switches the active node to the next one on the list of nodes
   * @param {Error} e Error that was given after a failed update() call
   */
  handleUpdateError (e) {
    console.error(e)
    if (this.cycleNodesIfTooManyErrors && ++this.consecutiveConnectionErrors >= this.errorTreshold) {
      this.nodeIndex = this.nodeIndex + 1 <= this.nodes.length ? this.nodeIndex + 1 : 0
      this.node = this.nodes[this.nodeIndex]
      rise.nodeAddress = this.node
      this.consecutiveConnectionErrors = 0
    }
  }

  /**
   * Function that is triggered when the transaction and status data has been successfully updated
   * @param {Object[]} newestTransactions Latest transactions
   * @param {Object} updatedStatus Latest system info
   * @param {Object[]} updatedNonEmptyTransactions Latest nonempty transactions
   */
  onUpdate (newestTransactions, updatedStatus, updatedNonEmptyTransactions) {
    latestTransactions = newestTransactions
    status = updatedStatus
    lastNonEmptyTransactions = updatedNonEmptyTransactions
  }

  /**
   * Starts the listener with the given poll time from the constructor; the listener calls update() on each time interval
   */
  run () {
    if (this.pollTime >= this.lowestPollTime && this.pollTime <= this.highestPollTime) {
      if (this.watcher === null) {
        this.watcher = setInterval(() => {
          this.update()
        }, 1000 * this.pollTime)
      } else {
        console.warn('Watcher is already running. Use stop() first to close the previous watcher and then restart with run().')
      }
    } else {
      console.error(`Invalid value for polltime; The polltime should be between ${this.lowestPollTime} and ${this.highestPollTime} seconds.`)
    }
  }

  /**
   * Sends a query to request account info (and optionally delegate info) from a RISE node using the RISE API
   * @param {{ query: { address1: string, address2: string, address3: string, address4: string, address5: string }} req The request received from the url
   * @param {{ send: function }} res The response that is going to be returned to the client
   */
  sendAccountQuery (req, res) {
    // include delegate information only if req.query.delegate is 1, exclude in all other cases
    const addresses = [ req.query.address1, req.query.address2, req.query.address3, req.query.address4, req.query.address5 ]
    this.fetchAccountInfo(addresses, req.query.delegate && req.query.delegate.toString() === '1', (response) => res.send(response))
  }

  /**
   * Sends a query to request all transactions during the time the client's browser was offline, from a peer node using the RISE API
   * @param {{ query: { address1: string, address2: string, address3: string, address4: string, address5: string }} req The request received from the url
   * @param {{ send: function }} res The response that is going to be returned to the client
   * @param {number} type The requested type of transactions; 1 = all transactions, 2 = only incoming, 3 = only outgoing
   */
  sendOfflineMessagesQuery (req, res, type = 1) {
    const blockheight = parseInt(req.query.blockheight, 10)
    if (typeof blockheight !== 'number') {
      res.send([])
    } else {
      const addresses = [ req.query.address1, req.query.address2, req.query.address3, req.query.address4, req.query.address5 ].filter((address, index) => address && address.match(riseRegex))
      try {
        this.fetchList(type, blockheight, addresses, (data) => res.send(data))
      } catch (e) {
        res.send([])
      }
    }
  }

  /**
   * Stops the listener
   */
  stop () {
    clearInterval(this.watcher)
    this.watcher = null
  }

  /**
   * Sends a request for a new transaction block from the RISE node and updates system information
   */
  update () {
    this.lastTimeChecked = new Date()
    rise.blocks.getHeight().then(({height}) => {
      this.consecutiveConnectionErrors = 0
      if (this.lastBlockHeightChecked >= height) {
        console.warn('Newest block height was not higher than the last checked block height')
        return
      }
      let oldestBlockRequested = this.lastBlockHeightChecked > 0 ? this.lastBlockHeightChecked : height - this.maxInitialBlocks
      this.lastBlockHeightChecked = height
      let query = { fromHeight: oldestBlockRequested, limit: 1000 }
      rise.transactions.getList(query).then((res) => {
        try {
          if (res.success && res.transactions) {
            console.log('Before update:')
            console.log('previousLastTransactions: ', this.previousLastTransactions)
            console.log('lastTransactions: ', this.lastTransactions)
            if (res.transactions.length > 0) this.lastNonEmptyTransactions = res
            this.previousLastTransactions = this.lastTransactions
            this.lastTransactions = res
            console.log('response is ', res)
            console.log('resultObj is ', this.getTransactions())
            this.onTriggerCallback(this.getTransactions(), this.getStatus(), this.lastNonEmptyTransactions)
            // try {
            //   if (res.transactions.length > 0) {
            //     // this.lastTransactions.transactions.sort(this.compare)
            //     this.lastNonEmptyTransactions = res
            //     this.onTriggerCallback(resultObj, this.getStatus(), this.lastNonEmptyTransactions)
            //     // setTimeout(() => {
            //     //   this.onTriggerCallback(this.lastTransactions.concat(this.previousLastTransactions), this.getStatus(), this.lastNonEmptyTransactions)
            //     // }, Math.min(res.transactions.length, 10000))
            //   } else {
            //     this.onTriggerCallback(this.previousLastTransactions, this.getStatus(), this.lastNonEmptyTransactions)
            //   }
            // } catch (e) {
            //   console.error(e)
            // }
          } else {
            console.warn('Response was not in correct format')
          }
        } catch (e) {
          console.error(e)
        }
      }).catch((err) => this.handleUpdateError(err))
    }).catch((err) => this.handleUpdateError(err))
  }
}
