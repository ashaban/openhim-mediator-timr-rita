'use strict'
const URI = require('urijs')
const axios = require('axios')
const nconf = require('nconf')
const logger = require('./winston')
const utils = require('./utils')
const timr = require('./timr')

const getRITALocationId = (uuid, orchestrations) => {
  return new Promise((resolve, reject) => {
    logger.info('Getting RITA Location ID from UUID ' + uuid)
    uuid = uuid.replace('urn:uuid:', '')
    uuid = uuid.replace('Location/', '')
    let identifier = `https://digitalhealth.intrahealth.org/source2|http://localhost:8081/hapi/fhir/hfr/Location/${uuid}`
    let url = new URI(nconf.get("fhir:baseURL")).segment("Rita5dd2b3a0064c5303fe0bcb4chfr").segment("Location").addQuery('identifier', identifier).toString()
    let before = new Date()
    axios.get(url, {
      withCredentials: true,
      auth: {
        username: nconf.get("fhir:username"),
        password: nconf.get("fhir:password")
      },
    }).then(response => {
      if (!response || !response.data || !response.data.entry || response.data.entry.length === 0) {
        return resolve()
      }
      let ritaIdent = response.data.entry[0].resource.identifier && response.data.entry[0].resource.identifier.find((ident) => {
        return ident.system === 'https://digitalhealth.intrahealth.org/source1'
      })
      if (!ritaIdent) {
        return reject()
      }
      let ritaUUID = ritaIdent.value.split('/').pop()
      let url = new URI(nconf.get("fhir:baseURL")).segment("Rita5dd2b3a0064c5303fe0bcb4c").segment("Location").segment(ritaUUID).toString()
      axios.get(url, {
        withCredentials: true,
        auth: {
          username: nconf.get("fhir:username"),
          password: nconf.get("fhir:password")
        },
      }).then(response => {
        orchestrations.push(utils.buildOrchestration('Fetching RITA Location From Mapping', before, 'GET', url.toString(), '', response, response.data))
        let ritaLocationId
        for (let identifier of response.data.identifier) {
          if (identifier.system === 'https://digitalhealth.intrahealth.org/source1') {
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

module.exports = {
  getRITALocationId: getRITALocationId,
  convertToRITA: async (patients, orchestrations) => {
    return new Promise(async (resolve, reject) => {
      let ritaPatients = {
        entry: []
      }
      for (let patient of patients) {
        let ritaPatient = {
          form_number: '',
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
          mother_village_id: "",
          father_education_id: '',
          father_occupation_id: '',
          father_nationality_id: '',
          father_country_birth_id: '',
          father_first_name: '',
          father_second_name: '',
          father_last_name: '',
          father_date_of_birth: '',
          father_national_identity_number: '',
          father_village_id: '',
          number_of_pregnancy: '',
          number_of_children: '',
          number_of_children_safe_delivery: '',
          number_death_before_delivery: '',
          month_of_pregnancy: '',
          informant_first_name: '',
          informant_second_name: '',
          informant_last_name: '',
          informant_phone_number: '',
          informant_national_identity_number: '',
          informant_relationship_id: '',
          informant_permanent_residence_village_id: '',
          date_of_informant: '',
          registration_centre_id: '',
          register_date: '',
          updated_at: '',
        }
        if (patient.resource.identifier) {
          let birthCert = patient.resource.identifier.find((id) => {
            return id.system === 'http://ivd.moh.go.tz/timr/birthcert'
          })
          if (birthCert) {
            ritaPatient.form_number = birthCert.value
          }
        }
        if (Array.isArray(patient.resource.name) && Array.isArray(patient.resource.name[0].given)) {
          ritaPatient.child_first_name = patient.resource.name[0].given[0]
          if (Object.keys(patient.resource.name[0].given).length > 1) {
            ritaPatient.child_second_name = patient.resource.name[0].given[1]
          }
          if (patient.resource.name[0].family) {
            ritaPatient.child_last_name = patient.resource.name[0].family
          }
        }
        if (patient.resource.birthDate) {
          ritaPatient.child_date_of_birth = patient.resource.birthDate
        }
        if (patient.resource.gender === 'male') {
          ritaPatient.gender = 1
        } else if (patient.resource.gender === 'female') {
          ritaPatient.gender = 2
        }
        for (let ext of patient.resource.extension) {
          if (ext.url === 'http://openiz.org/extensions/patient/contrib/timr/birthPlaceType') {
            ritaPatient.birth_place_id = ext.valueDecimal
          }
          if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/DedicatedFacilty') {
            if (ext.valueIdentifier && ext.valueIdentifier.value) {
              await getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaFacId) => {
                if (ritaFacId) {
                  ritaPatient.health_facility_id = ritaFacId
                }
              }).catch((err) => {
                logger.error(err);
              })
            }
          }
          if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/RegistrationFacility') {
            if (ext.valueIdentifier && ext.valueIdentifier.value) {
              await getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaFacId) => {
                if (ritaFacId) {
                  ritaPatient.registration_centre_id = ritaFacId
                }
              }).catch((err) => {
                logger.error(err);
              })
            }
          }
          if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
            if (ext.valueIdentifier && ext.valueIdentifier.value) {
              await getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaVilId) => {
                if (ritaVilId) {
                  ritaPatient.child_birth_place_village_id = ritaVilId
                }
              }).catch((err) => {
                logger.error(err);
              })
            }
          }
          if (ext.url === 'http://openiz.org/extensions/contrib/timr/birthAttendant') {
            ritaPatient.delivery_witness_id = ext.valueDecimal
          }
        }

        let motherResource = patient.resource.contained && patient.resource.contained.find((cont) => {
          return cont.relationship.coding && cont.relationship.coding.find((coding) => {
            return coding.code === 'MTH'
          })
        })
        if (motherResource) {
          if (Array.isArray(motherResource.name) && Array.isArray(motherResource.name[0].given)) {
            ritaPatient.mother_first_name = motherResource.name[0].given[0]
            if (Object.keys(motherResource.name[0].given).length > 1) {
              ritaPatient.mother_second_name = motherResource.name[0].given[1]
            }
            if (motherResource.name[0].family) {
              ritaPatient.mother_last_name = motherResource.name[0].family
            }
            let ident = motherResource.identifier && motherResource.identifier.find((ident) => {
              return ident.system === 'http://ivd.moh.go.tz/timr/nid'
            })
            if (ident) {
              ritaPatient.mother_national_identity_number = ident.value
            }
            if (motherResource.birthDate) {
              ritaPatient.mother_date_of_birth = motherResource.birthDate
            }
            if(motherResource.address && motherResource.address.length > 0) {
              let addressId
              for(let address of motherResource.address) {
                let villExt = address.extension.find((ext) => {
                  return ext.url === "http://openiz.org/fhir/profile#address-CensusTract"
                })
                if(villExt) {
                  addressId = villExt.valueString
                  break
                }
              }
              if(addressId) {
                await timr.getAccessToken(orchestrations, async(error, response, body) => {
                  if(!error || body.access_token) {
                    let access_token = body.access_token
                    await timr.getData("", `Location/${addressId}`, access_token, orchestrations).then(async({error, resp, body}) => {
                      if(body.resourceType) {
                        let fhirVillId = body.identifier && body.identifier.find((id) => {
                          return id.system === "http://hfrportal.ehealth.go.tz/"
                        })
                        if(fhirVillId) {
                          await getRITALocationId(fhirVillId.value, orchestrations).then((ritaVilId) => {
                            if (ritaVilId) {
                              ritaPatient.mother_village_id = ritaVilId
                            }
                          }).catch((err) => {
                            logger.error(err);
                          })
                        }
                      }
                    }).catch((err) => {
                      logger.error(err);
                    })
                  } else {
                    logger.error(error)
                    logger.error('Unable to get access token from TImR')
                  }
                })
              }
            }
            if (Array.isArray(motherResource.extension)) {
              for (let ext of motherResource.extension) {
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education') {

                }
                if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
                  if (ext.valueIdentifier && ext.valueIdentifier.value) {
                    if (ext.valueIdentifier.value === "urn:uuid:ffab8c9d-a195-36f1-b018-51f6346e5a62") {
                      await getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaLocationId) => {
                        if (ritaLocationId) {
                          ritaPatient.mother_country_birth_id = ritaLocationId
                        }
                      }).catch((err) => {
                        logger.error(err);
                      })
                    } else {
                      ritaPatient.mother_country_birth_id = ext.valueIdentifier.value
                    }
                  }
                }
                if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Citizen' && ext.valueCode) {
                  if (ext.valueCode === "TZ") {
                    await getRITALocationId("ffab8c9d-a195-36f1-b018-51f6346e5a62", orchestrations).then((ritaLocationId) => {
                      if (ritaLocationId) {
                        ritaPatient.mother_nationality_id = ritaLocationId
                      }
                    }).catch((err) => {
                      logger.error(err);
                    })
                  } else {
                    ritaPatient.mother_nationality_id = ext.valueCode
                  }
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education' && ext.valueCodeableConcept) {
                  if (Array.isArray(ext.valueCodeableConcept.coding)) {
                    if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Secondary') {
                      ritaPatient.mother_education_id = 4
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Primary') {
                      ritaPatient.mother_education_id = 2
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-University') {
                      ritaPatient.mother_education_id = 6
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-NoSchooling') {
                      ritaPatient.mother_education_id = 7
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostSecondary') {
                      ritaPatient.mother_education_id = 5
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostPrimary') {
                      ritaPatient.mother_education_id = 3
                    }
                  }
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/occupation' && ext.valueCodeableConcept) {
                  if (Array.isArray(ext.valueCodeableConcept.coding)) {
                    if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Farmer') {
                      ritaPatient.mother_occupation_id = 1
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Clerical') {
                      ritaPatient.mother_occupation_id = ""
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-NonEmployed') {
                      ritaPatient.mother_occupation_id = 9
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Skilled') {
                      ritaPatient.mother_occupation_id = 5
                    }
                  }
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies' && ext.valueDecimal) {
                  ritaPatient.number_of_pregnancy = ext.valueDecimal
                }

                if (ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies' && ext.valueDecimal) {
                  ritaPatient.number_of_children = ext.valueDecimal
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/liveBirths' && ext.valueDecimal) {
                  ritaPatient.number_of_children_safe_delivery = ext.valueDecimal
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/preNatalDeaths' && ext.valueDecimal) {
                  ritaPatient.number_death_before_delivery = ext.valueDecimal
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/pregnancyStatus/monthsCaring' && ext.valueDecimal) {
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
        if (fatherResource) {
          if (Array.isArray(fatherResource.name) && Array.isArray(fatherResource.name[0].given)) {
            ritaPatient.father_first_name = fatherResource.name[0].given[0]
            if (Object.keys(fatherResource.name[0].given).length > 1) {
              ritaPatient.father_second_name = fatherResource.name[0].given[1]
            }
            if (fatherResource.name[0].family) {
              ritaPatient.father_last_name = fatherResource.name[0].family
            }
            let ident = fatherResource.identifier && fatherResource.identifier.find((ident) => {
              return ident.system === 'http://ivd.moh.go.tz/timr/nid'
            })
            if (ident) {
              ritaPatient.father_national_identity_number = ident.value
            }
            if (fatherResource.birthDate) {
              ritaPatient.father_date_of_birth = fatherResource.birthDate
            }
            if(fatherResource.address && fatherResource.address.length > 0) {
              let addressId
              for(let address of fatherResource.address) {
                let villExt = address.extension.find((ext) => {
                  return ext.url === "http://openiz.org/fhir/profile#address-CensusTract"
                })
                if(villExt) {
                  addressId = villExt.valueString
                  break
                }
              }
              if(addressId) {
                await timr.getAccessToken(orchestrations, async(error, response, body) => {
                  if(!error || body.access_token) {
                    let access_token = body.access_token
                    await timr.getData("", `Location/${addressId}`, access_token, orchestrations).then(async({error, resp, body}) => {
                      if(body.resourceType) {
                        let fhirVillId = body.identifier && body.identifier.find((id) => {
                          return id.system === "http://hfrportal.ehealth.go.tz/"
                        })
                        if(fhirVillId) {
                          await getRITALocationId(fhirVillId.value, orchestrations).then((ritaVilId) => {
                            if (ritaVilId) {
                              ritaPatient.father_village_id = ritaVilId
                            }
                          }).catch((err) => {
                            logger.error(err);
                          })
                        }
                      }
                    }).catch((err) => {
                      logger.error(err);
                    })
                  } else {
                    logger.error(error)
                    logger.error('Unable to get access token from TImR')
                  }
                })
              }
            }
            if (Array.isArray(fatherResource.extension)) {
              for (let ext of fatherResource.extension) {
                if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Birthplace') {
                  if (ext.valueIdentifier && ext.valueIdentifier.value) {
                    if (ext.valueIdentifier.value === "urn:uuid:ffab8c9d-a195-36f1-b018-51f6346e5a62") {
                      await getRITALocationId(ext.valueIdentifier.value, orchestrations).then((ritaLocationId) => {
                        if (ritaLocationId) {
                          ritaPatient.father_country_birth_id = ritaLocationId
                        }
                      }).catch((err) => {
                        logger.error(err);
                      })
                    } else {
                      ritaPatient.father_country_birth_id = ext.valueIdentifier.value
                    }
                  }
                }
                if (ext.url === 'http://openiz.org/fhir/extension/rim/relationship/Citizen' && ext.valueCode) {
                  if (ext.valueCode === "TZ") {
                    await getRITALocationId("ffab8c9d-a195-36f1-b018-51f6346e5a62", orchestrations).then((ritaLocationId) => {
                      if (ritaLocationId) {
                        ritaPatient.father_nationality_id = ritaLocationId
                      }
                    }).catch((err) => {
                      logger.error(err);
                    })
                  } else {
                    ritaPatient.father_nationality_id = ext.valueCode
                  }
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/education' && ext.valueCodeableConcept) {
                  if (Array.isArray(ext.valueCodeableConcept.coding)) {
                    if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Secondary') {
                      ritaPatient.father_education_id = 4
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-Primary') {
                      ritaPatient.father_education_id = 2
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-University') {
                      ritaPatient.father_education_id = 6
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-NoSchooling') {
                      ritaPatient.father_education_id = 7
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostSecondary') {
                      ritaPatient.father_education_id = 5
                    } else if (ext.valueCodeableConcept.coding[0].code === 'EducationLevel-PostPrimary') {
                      ritaPatient.father_education_id = 3
                    }
                  }
                }
                if (ext.url === 'http://openiz.org/extensions/contrib/timr/socialIndicators/occupation' && ext.valueCodeableConcept) {
                  if (Array.isArray(ext.valueCodeableConcept.coding)) {
                    if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Farmer') {
                      ritaPatient.father_occupation_id = 1
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Clerical') {
                      ritaPatient.father_occupation_id = 7
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-NonEmployed') {
                      ritaPatient.father_occupation_id = 9
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Skilled') {
                      ritaPatient.father_occupation_id = 5
                    } else if (ext.valueCodeableConcept.coding[0].code === 'OccupationType-Fisherman') {
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
        if (informantResource) {
          if (Array.isArray(informantResource.name) && Array.isArray(informantResource.name[0].given)) {
            ritaPatient.informant_first_name = informantResource.name[0].given[0]
            if (Object.keys(informantResource.name[0].given).length > 1) {
              ritaPatient.informant_second_name = informantResource.name[0].given[1]
            }
            if (informantResource.name[0].family) {
              ritaPatient.informant_last_name = informantResource.name[0].family
            }
            let ident = informantResource.identifier && informantResource.identifier.find((ident) => {
              return ident.system === 'http://ivd.moh.go.tz/timr/nid'
            })
            if (ident) {
              ritaPatient.informant_national_identity_number = ident.value
            }
            if (informantResource.telecom) {
              let phone = informantResource.telecom.find((tele) => {
                return tele.system === 'phone'
              })
              if (phone) {
                ritaPatient.informant_phone_number = phone
              }
            }
            if(informantResource.address && informantResource.address.length > 0) {
              let addressId
              for(let address of informantResource.address) {
                let villExt = address.extension.find((ext) => {
                  return ext.url === "http://openiz.org/fhir/profile#address-CensusTract"
                })
                if(villExt) {
                  addressId = villExt.valueString
                  break
                }
              }
              if(addressId) {
                await timr.getAccessToken(orchestrations, async(error, response, body) => {
                  if(!error || body.access_token) {
                    let access_token = body.access_token
                    await timr.getData("", `Location/${addressId}`, access_token, orchestrations).then(async({error, resp, body}) => {
                      if(body.resourceType) {
                        let fhirVillId = body.identifier && body.identifier.find((id) => {
                          return id.system === "http://hfrportal.ehealth.go.tz/"
                        })
                        if(fhirVillId) {
                          await getRITALocationId(fhirVillId.value, orchestrations).then((ritaVilId) => {
                            if (ritaVilId) {
                              ritaPatient.informant_permanent_residence_village_id = ritaVilId
                            }
                          }).catch((err) => {
                            logger.error(err);
                          })
                        }
                      }
                    }).catch((err) => {
                      logger.error(err);
                    })
                  } else {
                    logger.error(error)
                    logger.error('Unable to get access token from TImR')
                  }
                })
              }
            }
            ritaPatient.informant_relationship_id = 'Contact'
            ritaPatient.date_of_informant = informantResource.meta.lastUpdated
          }
        }
        if (patient.resource.meta) {
          ritaPatient.register_date = patient.resource.meta.lastUpdated
          ritaPatient.updated_at = patient.resource.meta.lastUpdated
        }
        ritaPatients.entry.push(ritaPatient)
      }
      return resolve(ritaPatients)
    })
  }
}