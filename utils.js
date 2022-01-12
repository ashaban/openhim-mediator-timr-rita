'use strict'

const URI = require('urijs')
const moment = require("moment")

exports.buildOrchestration = (name, beforeTimestamp, method, url, requestContent, res, body) => {
  let uri = new URI(url)
  if (res == undefined || res == null || res == false) {
    var statusCode = 503
    var header = JSON.stringify({
      "response_header": "Empty Header Returned"
    })
    var time = moment().format()
  } else if ('statusCode' in res) {
    var statusCode = res.statusCode
    var header = res.headers
  }
  if(typeof body == 'object') {
    body = JSON.stringify(body)
  }
  return {
    name: name,
    request: {
      method: method,
      body: requestContent,
      timestamp: beforeTimestamp,
      path: uri.path(),
      querystring: uri.query()

    },
    response: {
      status: statusCode,
      headers: header,
      body: body,
      timestamp: new Date()
    }
  }
}