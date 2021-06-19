'use strict'
const URI = require('urijs')
const axios = require('axios')
const async = require('async')
const winston = require('winston')
const utils = require('./utils')

module.exports = function (fhirconf) {
  const config = fhirconf
  return {
    getRITALocationId: (uuid, orchestrations) => {
      return new Promise((resolve, reject) => {
        winston.info('Getting RITA Location ID from UUID ' + uuid)
        uuid = uuid.replace('urn:uuid:', '')
        uuid = uuid.replace('Location/', '')
        let identifier = `https://digitalhealth.intrahealth.org/source2|http://localhost:8081/hapi/fhir/hfr/Location/${uuid}`
        let url = new URI(config.baseURL).segment("Rita5dd2b3a0064c5303fe0bcb4chfr").segment("Location").addQuery('identifier', identifier).toString()
        let before = new Date()
        axios.get(url, {
          withCredentials: true,
          auth: {
            username: config.username,
            password: config.password
          },
        }).then(response => {
          if(!response || !response.data || !response.data.identifier) {
            return reject()
          }
          let ritaIdent = response.data.identifier.find((ident) => {
            return ident.system === 'https://digitalhealth.intrahealth.org/source1'
          })
          if(!ritaIdent) {
            return reject(true)
          }
          let ritaUUID = ritaIdent.value.split('/').pop()
          let url = new URI(config.baseURL).segment("Rita5dd2b3a0064c5303fe0bcb4c").segment("Location").segment(ritaUUID).toString()
          axios.get(url, {
            withCredentials: true,
            auth: {
              username: config.username,
              password: config.password
            },
          }).then(response => {
            orchestrations.push(utils.buildOrchestration('Fetching RITA Location From Mapping', before, 'GET', url.toString(), '', response, response.data))
            let ritaLocationId
            for(let identifier of response.data.identifier) {
              if(identifier.system === 'https://digitalhealth.intrahealth.org/source1') {
                ritaLocationId = identifier.value
              }
            }
            winston.info('Returning RITA ID ' + ritaLocationId)
            return resolve(ritaLocationId);
          })
        }).catch((err) => {
          winston.error('Error occured while getting resource from FHIR server');
          winston.error(err);
          return reject(err);
        })
      })
    }
  }
}