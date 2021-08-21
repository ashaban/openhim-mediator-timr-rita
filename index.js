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
const TImR = require('./timr')
const FHIR = require('./fhir')
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

  app.get('/Patient', (req, res) => {
    const timr = TImR(config.timr, config.oauth2)
    const fhir = FHIR(config.fhir)
    logger.info("Received a request to get Person records")
    let orchestrations = []
    timr.getAccessToken(orchestrations, (error, response, body) => {
      if(error || !body.access_token) {
        logger.error(error)
        logger.error('Unable to get access token from TImR')
        return res.status(500).send()
      }
      let _lastUpdated = req.query._lastUpdated
      let access_token = body.access_token
      timr.getPatients(_lastUpdated, access_token, orchestrations, async(error, resp, body) => {
        let ritaPatients = {
          entry: []
        }
        let next = body.link && body.link.find((link) => {
          return link.relation === 'next'
        })
        if(next) {
          ritaPatients.next = next.url.split('fhir')[1]
        }
        if(!body.entry) {
          return res.json(ritaPatients)
        }
        if(error) {
          return res.status(500).send(error)
        }
        for(let patient of body.entry) {
          let ritaPatient = {
            child_first_name: '',
            child_second_name: '',
            child_last_name: '',
            child_date_of_birth: '',
            gender: '',
            birth_place_id: '',
            health_facility_id: '',
            child_birth_place_village_id: '',
            delivery_witness_id: '',
            mother_first_name: '',
            mother_second_name: '',
            mother_last_name: '',
            mother_national_identity_number: '',
            mother_date_of_birth: '',
            mother_country_birth_id: '',
            mother_nationality_id: '',
            mother_education_id: '',
            mother_occupation_id: '',
            father_education_id: '',
            father_nationality_id: '',
            father_first_name: '',
            father_second_name: '',
            father_last_name: '',
            father_date_of_birth: '',
            father_national_identity_number: '',
            father_country_birth: '',
            number_of_pregnancy: '',
            number_of_children: '',
            number_of_children_safe_delivery: '',
            number_death_before_delivery: '',
            month_of_pregnancy: '',
            informant_first_name: '',
            informant_second_name: '',
            informant_last_name: '',
            informant_national_identity_number: '',
            informant_relationship_id: '',
            date_of_informant: '',
            registration_centre_id: '',
            register_date: '',
            updated_at: '',
          }
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
          if(patient.resource.gender === 'male') {
            ritaPatient.gender = 1
          } else if(patient.resource.gender === 'female') {
            ritaPatient.gender = 2
          }
          for(let ext of patient.resource.extension) {
            if(ext.url === 'http://openiz.org/extensions/patient/contrib/timr/birthPlaceType') {
              ritaPatient.birth_place_id = ext.valueDecimal
            }
            if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/DedicatedFacilty') {
              if(ext.valueIdentifier && ext.valueIdentifier.value) {
                await fhir.getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaFacId) => {
                  if(ritaFacId) {
                    ritaPatient.health_facility_id = ritaFacId
                  }
                }).catch((err) => {
                  logger.error(err);
                })
              }
            }
            if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/RegistrationFacility') {
              if(ext.valueIdentifier && ext.valueIdentifier.value) {
                await fhir.getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaFacId) => {
                  if(ritaFacId) {
                    ritaPatient.registration_centre_id = ritaFacId
                  }
                }).catch((err) => {
                  logger.error(err);
                })
              }
            }
            if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
              if(ext.valueIdentifier && ext.valueIdentifier.value) {
                await fhir.getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaVilId) => {
                  if(ritaVilId) {
                    ritaPatient.child_birth_place_village_id = ritaVilId
                  }
                }).catch((err) => {
                  logger.error(err);
                })
              }
            }
            if(ext.url === 'http://openiz.org/extensions/contrib/timr/birthAttendant') {
              ritaPatient.delivery_witness_id = ext.valueDecimal
            }
          }

          let motherResource = patient.resource.contained && patient.resource.contained.find((cont) => {
            return cont.relationship.coding && cont.relationship.coding.find((coding) => {
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
                ritaPatient.mother_date_of_birth = motherResource.birthDate
              }
              if(Array.isArray(motherResource.extension)) {
                for(let ext of motherResource.extension) {
                  if(ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education') {

                  }
                  if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
                    if(ext.valueIdentifier && ext.valueIdentifier.value) {
                      await fhir.getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaCountryId) => {
                        if(ritaCountryId) {
                          ritaPatient.mother_country_birth_id = ritaCountryId
                        }
                      }).catch((err) => {
                        logger.error(err);
                      })
                    }
                  }
                  if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Citizen' && ext.valueCode) {
                    ritaPatient.mother_nationality_id = ext.valueCode
                  }
                  if(ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education' && ext.valueCodeableConcept) {
                    if(Array.isArray(ext.valueCodeableConcept.coding)) {
                      if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Secondary') {
                        ritaPatient.mother_education_id = 4
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Primary') {
                        ritaPatient.mother_education_id = 2
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-University') {
                        ritaPatient.mother_education_id = 6
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-NoSchooling') {
                        ritaPatient.mother_education_id = 7
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostSecondary') {
                        ritaPatient.mother_education_id = 5
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostPrimary') {
                        ritaPatient.mother_education_id = 3
                      }
                    }
                  }
                  if(ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/occupation' && ext.valueCodeableConcept) {
                    if(Array.isArray(ext.valueCodeableConcept.coding)) {
                      if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Farmer') {
                        ritaPatient.mother_occupation_id = 1
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Clerical') {
                        ritaPatient.mother_occupation_id = ""
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-NonEmployed') {
                        ritaPatient.mother_occupation_id = 9
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Skilled') {
                        ritaPatient.mother_occupation_id = 5
                      }
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
          }

          let fatherResource = patient.resource.contained && patient.resource.contained.find((cont) => {
            return cont.relationship.coding && cont.relationship.coding.find((coding) => {
              return coding.code === 'FTH'
            })
          })
          if(fatherResource) {
            if(Array.isArray(fatherResource.name) && Array.isArray(fatherResource.name[0].given)) {
              ritaPatient.father_first_name = fatherResource.name[0].given[0]
              if(Object.keys(fatherResource.name[0].given).length > 1) {
                ritaPatient.father_second_name = fatherResource.name[0].given[1]
              }
              if(fatherResource.name[0].family) {
                ritaPatient.father_last_name = fatherResource.name[0].family
              }
              let ident = fatherResource.identifier && fatherResource.identifier.find((ident) => {
                return ident.system === 'http://ivd.moh.go.tz/timr/nid'
              })
              if(ident) {
                ritaPatient.father_national_identity_number = ident.value
              }
              if(fatherResource.birthDate) {
                ritaPatient.father_date_of_birth = fatherResource.birthDate
              }
              if(Array.isArray(fatherResource.extension)) {
                for(let ext of fatherResource.extension) {
                  if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
                    if(ext.valueIdentifier && ext.valueIdentifier.value) {
                      await fhir.getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaCountryId) => {
                        if(ritaCountryId) {
                          ritaPatient.father_country_birth_id = ritaCountryId
                        }
                      }).catch((err) => {
                        logger.error(err);
                      })
                    }
                  }
                  if(ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Citizen' && ext.valueCode) {
                    ritaPatient.father_nationality_id = ext.valueCode
                  }
                  if(ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education' && ext.valueCodeableConcept) {
                    if(Array.isArray(ext.valueCodeableConcept.coding)) {
                      if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Secondary') {
                        ritaPatient.father_education_id = 4
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Primary') {
                        ritaPatient.father_education_id = 2
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-University') {
                        ritaPatient.father_education_id = 6
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-NoSchooling') {
                        ritaPatient.father_education_id = 7
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostSecondary') {
                        ritaPatient.father_education_id = 5
                      } else if(ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostPrimary') {
                        ritaPatient.father_education_id = 3
                      }
                    }
                  }
                  if(ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/occupation' && ext.valueCodeableConcept) {
                    if(Array.isArray(ext.valueCodeableConcept.coding)) {
                      if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Farmer') {
                        ritaPatient.father_occupation_id = 1
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Clerical') {
                        ritaPatient.father_occupation_id = 7
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-NonEmployed') {
                        ritaPatient.father_occupation_id = 9
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Skilled') {
                        ritaPatient.father_occupation_id = 5
                      } else if(ext.valueCodeableConcept.coding[0].code === 'OccupationType-Fisherman') {
                        ritaPatient.father_occupation_id = 2
                      }
                    }
                  }
                }
              }
            }
          }

          let informantResource = patient.resource.contained && patient.resource.contained.find((cont) => {
            return cont.relationship.coding && cont.relationship.coding.find((coding) => {
              return coding.code === 'Contact'
            })
          })
          if(informantResource) {
            if(Array.isArray(informantResource.name) && Array.isArray(informantResource.name[0].given)) {
              ritaPatient.informant_first_name = informantResource.name[0].given[0]
              if(Object.keys(informantResource.name[0].given).length > 1) {
                ritaPatient.informant_second_name = informantResource.name[0].given[1]
              }
              if(informantResource.name[0].family) {
                ritaPatient.informant_last_name = informantResource.name[0].family
              }
              let ident = informantResource.identifier && informantResource.identifier.find((ident) => {
                return ident.system === 'http://ivd.moh.go.tz/timr/nid'
              })
              if(ident) {
                ritaPatient.informant_national_identity_number = ident.value
              }
              if(informantResource.telecom) {
                let phone = informantResource.telecom.find((tele) => {
                  return tele.system === 'phone'
                })
                if(phone) {
                  ritaPatient.informant_phone_number = phone
                }
              }
              ritaPatient.informant_relationship_id = 'Contact'
              ritaPatient.date_of_informant = informantResource.meta.lastUpdated
            }
          }
          if(patient.resource.meta) {
            ritaPatient.register_date = patient.resource.meta.lastUpdated
            ritaPatient.updated_at = patient.resource.meta.lastUpdated
          }
          ritaPatients.entry.push(ritaPatient)
        }
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