#!/usr/bin/env node

'use strict';

const express = require('express');
const medUtils = require('openhim-mediator-utils');
const utils = require('./utils');
const logger = require('./winston');
const moment = require('moment');
const request = require('request');
const isJSON = require('is-json');
const SENDEMAIL = require('./send_email');
const send_email = SENDEMAIL();
const URI = require('urijs');
const middleware = require('./middleware');
const TImR = require('./timr')
const bodyParser = require('body-parser');

const port = 9001;

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

  app.get('/Patient', (req, res) => {
    const timr = TImR(config.timr, config.oauth2)
    logger.info("Received a request to get Person records")
    let orchestrations = []
    timr.getAccessToken(orchestrations, (error, response, body) => {
      if(error) {

      }
      let _lastUpdated = req.query._lastUpdated
      let access_token = body.access_token
      timr.getPatients(_lastUpdated, access_token, orchestrations, (error, resp, body) => {
        let ritaPatients = []
        if(!body.entry) {
          return res.json(ritaPatients)
        }
        for(let patient of body.entry) {
          let ritaPatient = {}
          if(Array.isArray(patient.resource.name) && Array.isArray(patient.resource.name[0].given)) {
            ritaPatient.child_first_name = patient.resource.name[0].given[0]
            if(Object.keys(patient.resource.name[0].given).length > 1) {
              ritaPatient.child_second_name = patient.resource.name[0].given[1]
            }
            if(patient.resource.name[0].family) {
              ritaPatient.child_last_name = patient.resource.name[0].family
            }
          }
          if(patient.resource.birthDate) {
            ritaPatient.child_date_of_birth = patient.resource.birthDate
          }
          for(let ext of patient.resource.extension) {
            if(ext.url === 'http://openiz.org/extensions/patient/contrib/timr/birthPlaceType') {
              ritaPatient.birth_place_id = ext.valueDecimal
            }
            if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/DedicatedFacilty') {
              if(ext.valueReference && ext.valueReference.reference) {
                let facId = ext.valueReference.reference.split('/_history')[0]
                facId = facId.split('Location/')[1]
                ritaPatient.health_facility_id = facId
              }
            }
            if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
              if(ext.valueReference && ext.valueReference.reference) {
                let vilId = ext.valueReference.reference.split('/_history')[0]
                vilId = vilId.split('Location/')[1]
                ritaPatient.child_birth_place_village_id = vilId
              }
            }
            if(ext.url === 'http://openiz.org/extensions/contrib/timr/birthAttendant') {
              ritaPatient.delivery_witness_id = ext.valueDecimal
            }
          }

          let motherResource = patient.resource.contained.find((cont) => {
            return cont.relationship.coding.find((coding) => {
              return coding.code === 'MTH'
            })
          })
          if(motherResource) {
            if(Array.isArray(motherResource.name) && Array.isArray(motherResource.name[0].given)) {
              ritaPatient.mother_first_name = motherResource.name[0].given[0]
              if(Object.keys(motherResource.name[0].given).length > 1) {
                ritaPatient.mother_second_name = motherResource.name[0].given[1]
              }
              if(motherResource.name[0].family) {
                ritaPatient.mother_last_name = motherResource.name[0].family
              }
              let ident = motherResource.identifier && motherResource.identifier.find((ident) => {
                return ident.system === 'http://ivd.moh.go.tz/timr/nid'
              })
              if(ident) {
                ritaPatient.mother_national_identity_number = ident.value
              }
              if(motherResource.birthDate) {
                ritaPatient.mother_date_of_birth = motherResource,birthDate
              }
              for(let ext of motherResource.extension) {
                if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
                  if(ext.valueReference && ext.valueReference.reference) {
                    let countryId = ext.valueReference.reference.split('/_history')[0]
                    countryId = countryId.split('Location/')[1]
                    ritaPatient.mother_country_birth_id = countryId
                  }
                }
                if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Citizen' && ext.valueCode) {
                  ritaPatient.mother_nationality_id = ext.valueCode
                }
                if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Education' && ext.valueCodeableConcept) {
                  if(Array.isArray(ext.valueCodeableConcept.coding)) {
                    ritaPatient.mother_education_id = ext.valueCodeableConcept.coding[0].code
                  }
                }
                if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Occupation' && ext.valueCodeableConcept) {
                  if(Array.isArray(ext.valueCodeableConcept.coding)) {
                    ritaPatient.mother_occupation_id = ext.valueCodeableConcept.coding[0].code
                  }
                }
                if(ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies' && ext.valueDecimal) {
                  ritaPatient.number_of_pregnancy = ext.valueDecimal
                }

                if(ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies' && ext.valueDecimal) {
                  ritaPatient.number_of_children = ext.valueDecimal
                }
                if(ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/liveBirths' && ext.valueDecimal) {
                  ritaPatient.number_of_children_safe_delivery = ext.valueDecimal
                }
                if(ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/preNatalDeaths' && ext.valueDecimal) {
                  ritaPatient.number_death_before_delivery = ext.valueDecimal
                }
                if(ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/monthsCaring' && ext.valueDecimal) {
                  ritaPatient.month_of_pregnancy = ext.valueDecimal
                }
              }
            }
          }
          ritaPatients.push(ritaPatient)
        }
        logger.error(JSON.stringify(ritaPatients,0,2));
        return res.json(ritaPatients)
      })
    })
  })
  return app;
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
            });
            callback(server);
          });
        }
      });
    });
  } else {
    // default to config from mediator registration
    config = mediatorConfig.config;
    let app = setupApp();
    const server = app.listen(port, () => callback(server));
  }
}
exports.start = start;

if (!module.parent) {
  // if this script is run directly, start the server
  start(() => logger.info('Listening on ' + port + '...'));
}