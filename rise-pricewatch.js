const express = require('express')
const https = require('https')

module.exports = class {
  /**
   * @constructor
   * @param {{ sources: string[], pollTime: number, autostart: boolean, checkOnStartup: boolean, onTriggerCallback: function }} settings Creates the settings of the listener
   */
  constructor ({ source = 'https://api.coinmarketcap.com/v1/ticker/RISE/', pollTime = 600, checkOnStartup = true, autostart = true, pricePathName = '/rise_prices' } = {}) {
    this.source = source
    this.pollTime = pollTime
    this.pricewatcher = null
    this.priceJson = {}
    this.lowestPollTime = 60
    this.highestPollTime = 3600
    this.pricePathName = pricePathName
    if (checkOnStartup) this.checkPrices()
    if (autostart) this.start()
  }

  /**
  * Checks the price info from the given price source every interval and writes it to priceJson
  */
  checkPrices () {
    https.get(this.source, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          this.priceJson = JSON.parse(data)
        } catch (e) { }
      })
    }).on('error', (e) => { console.error(e) })
  }

  /**
   * Returns an Express app that exposes price info (RISE/USD and RISE/BTC) on HTTP(S) GET this.pricePathName (/rise_prices is the default path); if no Express app is given, a new one is created and returned
   * @param {function} app Express app
   * @param {string} [basePathName=''] Optional base path that precedes the price path name
   */
  getExpressAppWithPricewatcher (app = express(), basePathName = '') {
    return app.get(basePathName + this.pricePathName, (req, res) => {
      res.send(JSON.stringify(this.getPrices()))
    })
  }

  /**
   * Returns priceJson
   */
  getPrices () {
    return this.priceJson
  }

  /**
   * Starts the listener
   */
  start () {
    if (this.pollTime >= this.lowestPollTime && this.pollTime <= this.highestPollTime) {
      if (this.pricewatcher === null) {
        this.pricewatcher = setInterval(() => {
          this.update()
        }, 1000 * this.pollTime)
      } else {
        console.warn('Pricewatcher is already running. Use stop() first to close the previous watcher and then restart with start().')
      }
    } else {
      console.error(`Invalid value for polltime; The polltime should be between ${this.lowestPollTime} and ${this.highestPollTime} seconds.`)
    }
  }

  /**
   * Stops the listener
   */
  stop () {
    clearInterval(this.pricewatcher)
    this.pricewatcher = null
  }

  /**
   * Updates the prices
   */
  update () {
    this.checkPrices()
  }
}
