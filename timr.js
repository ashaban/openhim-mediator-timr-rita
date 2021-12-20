const URI = require('urijs');
const request = require('request')
const nconf = require('nconf')
const logger = require('./winston');
const utils = require('./utils')
module.exports = {
  getAccessToken: function (orchestrations, callback) {
    let url = URI(nconf.get("oauth2:url"))
    let before = new Date()
    var auth = "Basic " + Buffer.from(nconf.get("oauth2:client_id") + ":" + nconf.get("oauth2:client_secret")).toString("base64");
    var options = {
      url: url.toString(),
      headers: {
        Authorization: auth
      },
      body: `grant_type=password&username=${nconf.get("oauth2:username")}&password=${nconf.get("oauth2:password")}&scope=${nconf.get("oauth2:fhirScope")}`
    }
    request.post(options, (err, res, body) => {
      if (err) {
        logger.error(err)
        return callback(err)
      }
      orchestrations.push(utils.buildOrchestration('Getting Access Token From TImR', before, 'POST', url.toString(), options.body, res, body))
      try {
        body = JSON.parse(body)
      } catch (error) {
        logger.error(error)
        return callback(error)
      }
      callback(err, res, body)
    })
  },
  getData: (query, resource, access_token, orchestrations, callback) => {
    return new Promise((resolve, reject) => {
      let url = URI(nconf.get("timr:url")).segment(resource).addQuery('_format', 'json')
      if (query) {
        for (let index in query) {
          url = url.addQuery(index, query[index])
        }
      }
      let options = {
        url: url.toString(),
        headers: {
          Authorization: `BEARER ${access_token}`
        }
      }
      let before = new Date()
      request.get(options, (err, res, body) => {
        try {
          body = JSON.parse(body)
        } catch (error) {
          logger.error(error)
          return reject(error)
        }
        orchestrations.push(utils.buildOrchestration(`Getting ${resource} Data`, before, 'GET', nconf.get("timr:url").toString(), JSON.stringify(options.headers), res, body))
        return resolve({err, res, body})
      })
    })
  }
}