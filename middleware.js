const {
  Pool
} = require('pg')
const logger = require('./winston')

const pool = new Pool({
  user: 'postgres',
  password: '',
  database: 'timr_rita',
  host: 'localhost',
  port: 5432,
})

module.exports = {
  getPerson: () => {
    return new Promise((resolve, reject) => {
    let query = `select
      pat_vw.alt_id as child_barcode,
      pat_vw.given as child_given,
      pat_vw.family as child_family,
      pat_vw.dob as child_dob,
      pat_vw.gender_mnemonic as child_gender,
      pat_vw.mb_ord as child_multibirth,
      pat_vw.deceased as child_deceased,
      bptype.ext_value as child_birthplace,
      pat_vw.county as  child_district,
      mother.given as mother_given,
      mother.family as mother_family,
      mother.alt_id as mother_id,
      mother.alt_id_type as mother_id_type,
      mother.birthplace as mother_birthplace,
      mother.county AS mother_district,
      bnum.ext_value as mother_birth_no,
      age(pat_vw.dob, mother.dob) as mother_age_at_birth,
      father.given as father_given,
      father.family as father_family,
      father.alt_id as father_id,
      father.alt_id_type as father_id_type,
      father.tel as father_tel,
      father.birthplace as father_birthplace,
      father.county as father_district,
      other.given as informant_given,
      other.family as informant_family,
      case when nok_type <> 'Father' then nok_type else null end as informant_type,
      fac_id_tbl.ext_id as facility_id,
      bcext.ext_value as has_birthcert,
      pat_vw.crt_utc as last_registration_date
    FROM
      pat_vw
      INNER JOIN pat_tbl USING (pat_id)
      LEFT JOIN psn_vw mother ON (mother.psn_id = pat_tbl.mth_id)
      LEFT JOIN psn_vw father ON (father.psn_id = pat_tbl.nok_id AND pat_tbl.nok_typ_mnemonic = 'Father')
      LEFT JOIN psn_vw other ON (other.psn_id = pat_tbl.nok_id AND pat_tbl.nok_typ_mnemonic <> 'Father')
      LEFT JOIN ent_ext_tbl bnum ON (pat_tbl.pat_id = bnum.ent_id AND bnum.ext_typ = 'http://openiz.org/extensions/contrib/timr/birthNumber')
      LEFT JOIN ent_ext_tbl bptype ON (pat_tbl.pat_id = bptype.ent_id AND bptype.ext_typ = 'http://openiz.org/extensions/patient/contrib/timr/birthPlaceType')
      LEFT JOIN ent_ext_tbl bcext ON (pat_tbl.pat_id = bcext.ent_id AND bcext.ext_typ = 'hasBirthCertificate')
      LEFT JOIN fac_id_tbl ON (pat_vw.fac_id = fac_id_tbl.fac_id AND nsid = 'TZ_HFR_ID')`

      pool.query(query, (err, response) => {
        if (err) {
          logger.error(err)
          return reject();
        }
        if (response && response.hasOwnProperty('rows')) {
          logger.info("TImR has returned with " + response.rows.length + " rows for person")
          return resolve(response.rows)
        } else {
          logger.warn("Invalid response has been received from TImR while getting person records")
          return reject();
        }
      })
    })
  }
}