'use strict'
const URI = require('urijs')
const axios = require('axios')
const logger = require('./winston')
const utils = require('./utils')

module.exports = function (fhirconf) {
  const config = fhirconf
  return {
    getRITALocationId: (uuid, orchestrations) => {
      return new Promise((resolve, reject) => {
        logger.info('Getting RITA Location ID from UUID ' + uuid)
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
          if(!response || !response.data || !response.data.entry || response.data.entry.length === 0) {
            return resolve()
          }
          let ritaIdent = response.data.entry[0].resource.identifier && response.data.entry[0].resource.identifier.find((ident) => {
            return ident.system === 'https://digitalhealth.intrahealth.org/source1'
          })
          if(!ritaIdent) {
            return reject()
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
            logger.info('Returning RITA ID ' + ritaLocationId)
            return resolve(ritaLocationId);
          })
        }).catch((err) => {
          logger.error('Error occured while getting resource from FHIR server');
          logger.error(err);
          return reject(err);
        })
      })
    }
  }
}