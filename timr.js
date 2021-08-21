const URI = require('urijs');
const request = require('request')
const logger = require('./winston');
const utils = require('./utils')
module.exports = function (timrcnf, oauthcnf) {
  const timrconfig = timrcnf
  const oauthconfig = oauthcnf
  return {
    getAccessToken: function (orchestrations, callback) {
      let url = URI(oauthconfig.url)
      let before = new Date()
      var auth = "Basic " + Buffer.from(oauthconfig.client_id + ":" + oauthconfig.client_secret).toString("base64");
      var options = {
        url: url.toString(),
        headers: {
          Authorization: auth
        },
        body: `grant_type=password&username=${oauthconfig.username}&password=${oauthconfig.password}&scope=${oauthconfig.fhirScope}`
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
    getPatients: (_lastUpdated, access_token, orchestrations, callback) => {
      let url = URI(timrconfig.url).segment('Patient').addQuery('_format', 'json')
      if(_lastUpdated) {
        url = url.addQuery('_lastUpdated', _lastUpdated)
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
          return callback(error)
        }
        orchestrations.push(utils.buildOrchestration('Getting Patients Data', before, 'GET', timrconfig.url.toString(), JSON.stringify(options.headers), res, body))
        return callback(err, res, body)
      })
    }
  }
}