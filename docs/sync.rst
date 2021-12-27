Data synchronization - Tabular
==============================
The mediator comes with a single API that can be triggered to push data to RITA. The name of the API is /pushPatients which supports the POST method. This end point pulls data from TImR using FHIR standard which then it converts these data to RITA format and finally sends the converted data to RITA.

*Below are the data elements that are currently being sent to RITA*
*******************************************************************

.. list-table:: Variables

  * - Name
    - Value

  * - $mother
    - contained.find(c=>c.resourceType == "RelatedPerson" && c.relationship.coding[0].code == "MTH")

  * - $father
    - contained.find(c=>c.resourceType == "RelatedPerson" && c.relationship.coding[0].code == "FTH")

  * - $informant
    - contained.find(c=>c.resourceType == "RelatedPerson" && c.relationship.coding[0].code == "Contact")

  * - $createdBy
    - extension.find(e=>e.url=="http://openiz.org/fhir/extension/rim/relationship/CreatedBy").valueReference.reference

.. list-table:: RITA-FHIR Mappings

  * - RITA DATA Element
    - RITA Data in FHIR (TImR)

  * - form_number
    - identifier.find(id => id.system == "http://ivd.moh.go.tz/timr/birthcert").value

  * - child_first_name
    - name[0].given[0]

  * - child_second_name
    - name[0].given[1]

  * - child_last_name
    - name[0].family

  * - gender
    - gender

  * - child_date_of_birth
    - birthDate

  * - birth_place_id
    - extension.find(|br|
      e => e.url == "http://openiz.org/extensions/patient/contrib/timr/birthPlaceType"|br|
      ).valueDecimal

  * - health_facility_id
    - extension.find(|br|
      e => e.url=="http://openiz.org/fhir/extension/rim/relationship/DedicatedFacilty"|br|
      ).valueIdentifier.value

  * - child_birth_place_village_id
    - extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/Birthplace"|br|
      ).valueIdentifier.value

  * - delivery_witness_id
    - extension.find(|br|
      e => e.url == "http://openiz.org/extensions/contrib/timr/birthAttendant"|br|
      ).valueDecimal

  * - mother_first_name
    - $mother.name[0].given[0]

  * - mother_second_name
    - $mother.name[0].given[1]

  * - mother_last_name
    - $mother.name[0].family

  * - mother_national_identity_number
    - $mother.identifier.find(|br|
      id => id.system == "http://ivd.moh.go.tz/timr/nid"|br|
      ).value

  * - mother_date_of_birth
    - $mother.birthDate

  * - mother_country_birth_id
    - $mother.extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/Birthplace"|br|
      ).valueIdentifier.value

  * - mother_nationality_id
    - $mother.extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/Citizen"|br|
      ).valueCode

  * - mother_education_id
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/socialIndicators/education"|br|
      ).valueCodeableConcept.coding[0].code

  * - mother_occupation_id
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/socialIndicators/occupation"|br|
      ).valueCodeableConcept.coding[0].code

  * - mother_village_id
    - $mother.address.find(|br|
      addr => addr.extension.find(e=>e.url=="http://openiz.org/fhir/profile#address-CensusTract"|br|
      ).valueString)

  * - father_education_id
    - $father.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/socialIndicators/education"|br|
      ).valueCodeableConcept.coding[0].code

  * - father_occupation_id
    - $father.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/socialIndicators/occupation"|br|
      ).valueCodeableConcept.coding[0].code

  * - father_nationality_id
    - $father.extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/Citizen"|br|
      ).valueCode

  * - father_country_birth_id
    - $father.extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/Birthplace"|br|
      ).valueIdentifier.value

  * - father_first_name
    - $father.name[0].given[0]

  * - father_second_name
    - $father.name[0].given[1]

  * - father_last_name
    - $father.name[0].family

  * - father_date_of_birth
    - $father.birthDate

  * - father_national_identity_number
    - $father.identifier.find(id => id.system == "http://ivd.moh.go.tz/timr/nid").value

  * - father_village_id
    - $father.address.find(|br|
      addr => addr.extension.find(e=>e.url == "http://openiz.org/fhir/profile#address-CensusTract"|br|
      ).valueString)

  * - number_of_pregnancy
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies"|br|
      ).valueDecimal

  * - number_of_children
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/pregnancyStatus/previousPregnancies"|br|
      ).valueDecimal

  * - number_of_children_safe_delivery
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/pregnancyStatus/liveBirths"|br|
      ).valueDecimal

  * - number_death_before_delivery
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/pregnancyStatus/preNatalDeaths"|br|
      ).valueDecimal

  * - month_of_pregnancy
    - $mother.extension.find(|br|
      e=>e.url=="http://openiz.org/extensions/contrib/timr/pregnancyStatus/monthsCaring"|br|
      ).valueDecimal

  * - informant_first_name
    - $informant.name[0].given[0]

  * - informant_second_name
    - $informant.name[0].given[1]

  * - informant_last_name
    - $informant.name[0].family

  * - informant_phone_number
    - $informant.telecom.find(tel => tel.system == "phone").value

  * - informant_national_identity_number
    - $informant.identifier.find(id => id.system == "http://ivd.moh.go.tz/timr/nid").value

  * - informant_relationship_id
    - contained.find(c=>c.id == $informant.id).relationship.coding[0].code

  * - informant_permanent_residence_village_id
    - $informant.address.find(|br|
      addr => addr.extension.find(e=>e.url == "http://openiz.org/fhir/profile#address-CensusTract"|br|
      ).valueString)

  * - date_of_informant
    - $informant.meta.lastUpdated

  * - registration_centre_id
    - extension.find(|br|
      e => e.url == "http://openiz.org/fhir/extension/rim/relationship/RegistrationFacility"|br|
      ).valueIdentifier.value

  * - register_date
    - meta.lastUpdated

  * - updated_at
    - meta.lastUpdated


**Pending RITA Dataelements**

  #. birthStatus
  #. childWeight
  #. father_date_of_birth
  #. informant_phone_number
  #. registrar_first_name
  #. registrar_second_name
  #. registrar_last_name

  .. |br| raw:: html

     <br>