'use strict'

const request = require('request')
const utils = require('openhim-mediator-utils')

module.exports = (ohmOpts) => {
  return {
    fetchChannelByName: (name, callback) => {
      utils.authenticate(ohmOpts, () => {
        const options = {
          url: `${ohmOpts.apiURL}/channels`,
          headers: utils.genAuthHeaders(ohmOpts),
          json: true
        }
        request.get(options, (err, res, channels) => {
          if (err) { return callback(err) }
          let channel = null
          channels.forEach((c) => {
            if (c.name === name) { channel = c }
          })
          if (channel) {
            callback(null, channel)
          } else {
            callback(new Error('Could not find channel in result set'))
          }
        })
      })
    },

    updateChannel: (_id, channel, callback) => {
      utils.authenticate(ohmOpts, () => {
        const options = {
          url: `${ohmOpts.apiURL}/channels/${_id}`,
          headers: utils.genAuthHeaders(ohmOpts),
          body: channel,
          json: true
        }
        request.put(options, (err, res) => {
          if (err) { return callback(err) }
          callback()
        })
      })
    },
    updateConfig: (urn, config_update, callback) => {
      utils.authenticate(ohmOpts, () => {
        const options = {
          url: `${ohmOpts.apiURL}/mediators/${urn}/config`,
          headers: utils.genAuthHeaders(ohmOpts),
          body: config_update,
          json: true
        }
        request.put(options, (err, res,body) => {
          if (err) { return callback(err) }
          callback()
        })
      })
    }
  }
}
