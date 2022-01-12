#!/usr/bin/env node

'use strict';

const express = require('express');
const medUtils = require('openhim-mediator-utils');
const logger = require('./winston');
const request = require('request');
const nconf = require('nconf')
const async = require('async')
const fs = require('fs')
const moment = require('moment')
const timr = require('./timr')
const fhir = require('./fhir')
const OpenHIM = require('./openhim')
const utils = require('./utils')
const bodyParser = require('body-parser');

const port = 9002;

// Config
var config = {}; // this will vary depending on whats set in openhim-core
const apiConf = require('./config/config');
const mediatorConfig = require('./config/mediator');

// socket config - large documents can cause machine to max files open
const https = require('https');
const http = require('http');

https.globalAgent.maxSockets = 32;
http.globalAgent.maxSockets = 32;

//set environment variable so that the mediator can be registered
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;

function setupApp() {
  const app = express();
  var rawBodySaver = function (req, res, buf, encoding) {
    if (buf && buf.length) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  };
  app.use(
    bodyParser.raw({
      verify: rawBodySaver,
      type: '*/*',
    })
  );
  app.use(
    bodyParser.urlencoded({
      extended: true,
    })
  );
  app.use(bodyParser.json({
    limit: '10Mb',
    type: ['application/fhir+json', 'application/json+fhir', 'application/json']
  }));

  function updateTransaction(
    req,
    body,
    statatusText,
    statusCode,
    orchestrations
  ) {
    const transactionId = req.headers['x-openhim-transactionid'];
    var update = {
      'x-mediator-urn': mediatorConfig.urn,
      status: statatusText,
      response: {
        status: statusCode,
        timestamp: new Date(),
        body: body,
      },
      orchestrations: orchestrations,
    };
    medUtils.authenticate(apiConf.api, function (err) {
      if (err) {
        return logger.error(err.stack);
      }
      var headers = medUtils.genAuthHeaders(apiConf.api);
      var options = {
        url: apiConf.api.apiURL + '/transactions/' + transactionId,
        headers: headers,
        json: update,
      };

      request.put(options, function (err, apiRes, body) {
        if (err) {
          return logger.error(err);
        }
        if (apiRes.statusCode !== 200) {
          return logger.error(
            new Error(
              'Unable to save updated transaction to OpenHIM-core, received status code ' +
              apiRes.statusCode +
              ' with body ' +
              body
            ).stack
          );
        }
        logger.info(
          'Successfully updated transaction with id ' + transactionId
        );
      });
    });
  }

  app.get('/pushPatients', (req, res) => {
    logger.info("Received a request to get Person records")
    res.end()
    let lastSync = moment().format("YYYY-MM-DDTHH:mm:ss")
    const openhim = OpenHIM(apiConf.api)
    updateTransaction(req, "Still Processing", "Processing", "200", "")
    let errorOccured = false
    let auth = "Basic " + Buffer.from(nconf.get('rita:username') + ":" + nconf.get('rita:password')).toString("base64");
    let options = {
      url: nconf.get('rita:url').toString(),
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth
      }
    }
    let query = {
      _lastUpdated: 'ge' + config.rita.last_sync
    }
    if(config.rita.reset) {
      query._lastUpdated = 'ge1970-01-01T00:00:00'
    }
    let orchestrations = []
    let nextURL = false
    async.doWhilst(
      (callback) => {
        nextURL = false
        let before = new Date()
        timr.getAccessToken(orchestrations, (error, response, body) => {
          if(error || !body.access_token) {
            logger.error(error)
            logger.error('Unable to get access token from TImR')
            return res.status(500).send()
          }
          let access_token = body.access_token
          timr.getData(query, 'Patient', access_token, orchestrations).then(async({error, resp, body}) => {
            if(!body.entry) {
              return callback(null)
            }
            if(error) {
              return res.status(500).send(error)
            }
            let next = body.link && body.link.find((link) => {
              return link.relation === 'next'
            })
            if(next) {
              nextURL = next.url.split('fhir')[1]
            }
            let ritaPatients = await fhir.convertToRITA(body.entry, orchestrations)
            options.json = ritaPatients
            request.post(options, (err, res, body) => {
              if(err) {
                errorOccured = true
              }
              orchestrations.push(utils.buildOrchestration('Pushing data to RITA', before, 'POST', options.url, JSON.stringify(options.json), res, JSON.stringify(body)))
              return callback(null)
            })
          })
        })
      },
      (callback) => {
        return callback(null, nextURL !== false)
      },
      () => {
        config.rita.last_sync = lastSync
        config.rita.reset = false
        openhim.updateConfig(mediatorConfig.urn, config, (res) => {
          logger.info("Done Updating Last Sync")
        })
        logger.info('Done')
        updateTransaction(req, "", "Successful", "200", orchestrations)
      }
    )
  })
  app.get('/Patient', (req, res) => {
    logger.info("Received a request to get Person records")
    let orchestrations = []
    timr.getAccessToken(orchestrations, (error, response, body) => {
      if(error || !body.access_token) {
        logger.error(error)
        logger.error('Unable to get access token from TImR')
        return res.status(500).send()
      }
      let access_token = body.access_token
      timr.getData(req.query, 'Patient', access_token, orchestrations).then(async({error, resp, body}) => {
        if(!body.entry) {
          return res.json({
            entry: []
          })
        }
        if(error) {
          return res.status(500).send(error)
        }
        let ritaPatients = await fhir.convertToRITA(body.entry, orchestrations)
        let next = body.link && body.link.find((link) => {
          return link.relation === 'next'
        })
        if(next) {
          ritaPatients.next = next.url.split('fhir')[1]
        }
        return res.json(ritaPatients)
      })
    })
  })
  return app;
}

function reloadConfig(data, callback) {
  const tmpFile = `${__dirname}/config/tmpConfig.json`;
  fs.writeFile(tmpFile, JSON.stringify(data, 0, 2), (err) => {
    if (err) {
      throw err;
    }
    nconf.file(tmpFile);
    return callback();
  });
}
/**
 * start - starts the mediator
 *
 * @param  {Function} callback a node style callback that is called once the
 * server is started
 */
function start(callback) {
  if (apiConf.register) {
    medUtils.registerMediator(apiConf.api, mediatorConfig, err => {
      if (err) {
        logger.error('Failed to register this mediator, check your config');
        logger.error(err.stack);
        process.exit(1);
      }
      apiConf.api.urn = mediatorConfig.urn;
      medUtils.fetchConfig(apiConf.api, (err, newConfig) => {
        logger.info('Received initial config:', newConfig);
        config = newConfig;
        reloadConfig(config, () => {})
        if (err) {
          logger.info('Failed to fetch initial config');
          logger.info(err.stack);
          process.exit(1);
        } else {
          logger.info('Successfully registered mediator!');
          let app = setupApp();
          const server = app.listen(port, () => {
            let configEmitter = medUtils.activateHeartbeat(apiConf.api);
            configEmitter.on('error', error => {
              logger.error(error);
              logger.error('an error occured while trying to activate heartbeat');
            });
            configEmitter.on('config', newConfig => {
              logger.info('Received updated config:', newConfig);
              // set new config for mediator
              config = newConfig;
              reloadConfig(config, () => {})
            });
            callback(server);
          });
        }
      });
    });
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config;
    reloadConfig(config, () => {})
    let app = setupApp();
    const server = app.listen(port, () => callback(server));
  }
}
exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => logger.info('Listening on ' + port + '...'));
}