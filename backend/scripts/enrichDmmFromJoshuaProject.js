/**
 * enrichDmmFromJoshuaProject.js
 * ---------------------------------------------------------------------------
 * Enrichit les fiches des peuples DMM avec les données Joshua Project (JP),
 * en s'appuyant sur le fichier de mapping complété à la main :
 *
 *   backend/data/dmm_cm_mapping.csv
 *   colonnes (séparateur ';') : dmmName;chosenRop3;chosenName;candidate1;candidate2;candidate3
 *
 * La colonne `chosenName` contient le nom JP retenu suivi de l'identifiant
 * Registry of Peoples (ROP3) entre crochets, ex. « Akum [100198] (0.25) ».
 * (Ce nombre est le ROP3, généré par buildDmmMappingCsv.js — PAS le PeopleID3.)
 * On extrait ce ROP3, on récupère la fiche JP correspondante (via l'API
 * publique de Joshua Project, filtrée sur le pays), puis on écrit les champs
 * suivants :
 *
 *   - primaryLanguageName   -> master.primaryLanguageName
 *   - jpScale               -> master.status.jpScale        (+ people_statuses.jpScale)
 *   - leastReached          -> master.status.leastReached   (+ people_statuses.leastReached)
 *   - percentEvangelical    -> master.status.percentEvangelical (+ people_statuses.percentEvangelical)
 *   - bibleStatus           -> people_statuses.bibleStatus  (+ master.status.bibleStatus)
 *
 * Ces champs sont ceux que la route GET /api/master-people/:id lit pour bâtir
 * l'objet `overview` consommé par la fiche peuple du frontend
 * (frontend/src/pages/PeopleDetailLite.jsx). Une copie de provenance est aussi
 * écrite dans master.referenceData (jamais utilisée pour les métriques DMM).
 *
 * Le script est IDEMPOTENT : le relancer réécrit simplement les mêmes valeurs.
 * Par défaut il NE FAIT AUCUNE écriture (dry-run) ; ajouter --commit pour écrire.
 *
 * Usage :
 *   node backend/scripts/enrichDmmFromJoshuaProject.js                 # dry-run (CM)
 *   node backend/scripts/enrichDmmFromJoshuaProject.js --commit        # écrit en base
 *   node backend/scripts/enrichDmmFromJoshuaProject.js --country=CM --commit
 *   node backend/scripts/enrichDmmFromJoshuaProject.js --file=data/dmm_cm_mapping.csv --commit
 *
 * Variables d'environnement (backend/.env) :
 *   MONGODB_URI   (défaut : mongodb://localhost:27017/church-planting)
 *   JP_API_KEY    (défaut : la clé publique déjà utilisée par joshuaProjectService.js)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const axios = require('axios');

const MasterPeople = require('../models/MasterPeople');
const PeopleStatus = require('../models/PeopleStatus');
const { COUNTRY_CONFIG } = require('../routes/countries');

// ── Arguments ───────────────────────────────────────────────────────────────
const ARGS = process.argv.slice(2);
const COMMIT = ARGS.includes('--commit'); // sans --commit => dry-run
const getArg = (name, def) => {
  const a = ARGS.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const COUNTRY = String(getArg('country', 'CM')).trim().toUpperCase();
const FILE = getArg('file', path.join('data', `dmm_${COUNTRY.toLowerCase()}_mapping.csv`));

// ── Configuration Joshua Project ─────────────────────────────────────────────
const JP_API_BASE = 'https://api.joshuaproject.net/v1/people_groups.json';
const JP_API_KEY = process.env.JP_API_KEY || '2b454615e985';
const JP_PAGE_SIZE = 250;

// Table de correspondance ISO2 pays -> ROG3 Joshua Project.
// IMPORTANT : les codes ROG3 de Joshua Project sont, pour ces pays, identiques à
// l'ISO2 (CM=Cameroun, TD=Tchad, NI=Nigeria, …). Vérifié via l'API : la fiche
// « Akum » (rop3=100198) renvoie bien ROG3 "CM" pour le Cameroun.
const ISO2_TO_ROG3 = {
  CM: 'CM', // Cameroun
  TD: 'TD', // Tchad
  CF: 'CT', // République centrafricaine
  CG: 'CF', // Congo (Brazzaville)
  CD: 'CG', // RD Congo
  GA: 'GB', // Gabon
  GQ: 'GQ', // Guinée équatoriale
  NG: 'NI', // Nigeria
};

// ── Utilitaires ───────────────────────────────────────────────────────────────
const stripBom = (s) => s.replace(/^\ufeff/, '');
const toNum = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[, %]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Extrait le ROP3 Joshua Project d'une valeur `chosenName`.
 * Ex. « Akum [100198] (0.25) » -> "100198". « Bororo Fulani [-] (0.43) » -> null.
 */
function extractRop3(chosenName) {
  if (!chosenName) return null;
  const m = String(chosenName).match(/\[(\d+)\]/);
  return m ? m[1] : null;
}

/** Parse le CSV de mapping (séparateur ';'). */
function parseCsv(file) {
  const p = path.join(__dirname, '..', file);
  if (!fs.existsSync(p)) throw new Error(`Fichier de mapping introuvable : ${p}`);
  const lines = stripBom(fs.readFileSync(p, 'utf8')).split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((l) => {
    const c = l.split(';');
    return {
      dmmName: (c[0] || '').trim(),
      chosenRop3: (c[1] || '').trim(),
      chosenName: (c[2] || '').trim(),
    };
  });
}

/**
 * Récupère la fiche JP pour un ROP3 donné.
 *
 * IMPORTANT : l'API v1 de Joshua Project attend les paramètres de filtre en
 * MINUSCULES (`rop3=…`) ; les variantes en majuscules (`ROP3=`, `ROG3=`) sont
 * ignorées et renvoient la première page globale. Un même ROP3 pouvant exister
 * dans plusieurs pays, on privilégie la fiche dont le ROG3 correspond au pays
 * ciblé ; à défaut on prend la première.
 */
async function fetchJpForRop3(rop3, rog3) {
  const { data } = await axios.get(JP_API_BASE, {
    params: { api_key: JP_API_KEY, rop3, limit: JP_PAGE_SIZE },
    timeout: 30000,
  });
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return null;
  // Ne garder que les fiches ayant réellement ce ROP3 (garde-fou si le filtre
  // était ignoré par l'API), puis préférer le bon pays.
  const exact = rows.filter((r) => String(r.ROP3) === String(rop3));
  const pool = exact.length ? exact : rows;
  return pool.find((r) => String(r.ROG3).toUpperCase() === String(rog3).toUpperCase()) || pool[0];
}

/** Convertit une fiche JP brute en champs applicatifs. */
function mapJpRecord(jp) {
  const leastReachedRaw = jp.LeastReached;
  const leastReached =
    leastReachedRaw === 'Y' || leastReachedRaw === 'Yes' || leastReachedRaw === 1 || leastReachedRaw === true
      ? true
      : leastReachedRaw === 'N' || leastReachedRaw === 'No' || leastReachedRaw === 0 || leastReachedRaw === false
      ? false
      : null;
  return {
    primaryLanguageName: jp.PrimaryLanguageName || null,
    jpScale: toNum(jp.JPScale),
    leastReached,
    percentEvangelical: toNum(jp.PercentEvangelical),
    percentChristian: toNum(jp.PercentAdherents) ?? toNum(jp.PercentChristianPC),
    bibleStatus: jp.BibleStatus != null && jp.BibleStatus !== '' ? String(jp.BibleStatus) : null,
    matchedName: jp.PeopNameInCountry || jp.PeopNameAcrossCountries || null,
    rop3: jp.ROP3 || null,
    peopleId: jp.PeopleID3 != null ? String(jp.PeopleID3) : null,
  };
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting';
  const iso3 = (COUNTRY_CONFIG[COUNTRY] || {}).code3;
  const rog3 = ISO2_TO_ROG3[COUNTRY];
  if (!iso3) throw new Error(`Pays inconnu dans COUNTRY_CONFIG : ${COUNTRY}`);
  if (!rog3) throw new Error(`Pas de ROG3 Joshua Project pour le pays ${COUNTRY}. Ajouter une entrée dans ISO2_TO_ROG3.`);

  console.log(`\n=== Enrichissement JP des peuples DMM (${COUNTRY} / ISO3=${iso3} / ROG3=${rog3}) ===`);
  console.log(`Mode : ${COMMIT ? 'ÉCRITURE (--commit)' : 'DRY-RUN (aucune écriture)'}`);
  console.log(`Fichier : ${FILE}\n`);

  const rows = parseCsv(FILE);
  const withId = rows
    .map((r) => ({ ...r, rop3Id: extractRop3(r.chosenName) }))
    .filter((r) => r.rop3Id);
  console.log(`Lignes du mapping : ${rows.length} | avec un ROP3 JP exploitable : ${withId.length}`);

  console.log('Récupération des fiches Joshua Project (une requête par ROP3)…');
  // Un appel API par ROP3 unique (dédupliqué), avec petite mise en cache.
  const jpByRop3 = new Map();
  const uniqueRop3 = [...new Set(withId.map((r) => r.rop3Id))];
  for (const rop3 of uniqueRop3) {
    try {
      const jp = await fetchJpForRop3(rop3, rog3);
      if (jp) jpByRop3.set(rop3, jp);
    } catch (e) {
      console.warn(`   ! Échec fetch JP pour ROP3=${rop3} : ${e.message}`);
    }
  }
  console.log(`ROP3 résolus côté JP : ${jpByRop3.size} / ${uniqueRop3.length}\n`);

  await mongoose.connect(uri);

  // Pré-charge les masters DMM du pays et les indexe par nom normalisé, pour
  // tolérer les petites différences de casse/accents entre le CSV et la base.
  const normName = (v) =>
    String(v == null ? '' : v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les accents
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const dmmMasters = await MasterPeople.find({ primaryCountryCode: iso3, sourceTypes: 'DMM' });
  const masterByExact = new Map();
  const masterByNorm = new Map();
  dmmMasters.forEach((m) => {
    masterByExact.set(m.canonicalName, m);
    const k = normName(m.canonicalName);
    if (!masterByNorm.has(k)) masterByNorm.set(k, m);
  });
  console.log(`Masters DMM (${iso3}) en base : ${dmmMasters.length}\n`);

  let updated = 0;
  const notFoundMaster = [];
  const notFoundJp = [];
  const report = [];

  for (const r of withId) {
    const jp = jpByRop3.get(r.rop3Id);
    if (!jp) {
      notFoundJp.push(`${r.dmmName} (JP ROP3=${r.rop3Id} absent du pays ${rog3})`);
      continue;
    }
    const v = mapJpRecord(jp);

    // Retrouve le master DMM correspondant : correspondance exacte du nom,
    // sinon repli sur le nom normalisé (casse/accents ignorés).
    const master = masterByExact.get(r.dmmName) || masterByNorm.get(normName(r.dmmName));
    if (!master) {
      notFoundMaster.push(r.dmmName);
      continue;
    }

    report.push({
      dmm: r.dmmName,
      jp: v.matchedName,
      peopleId: v.peopleId,
      lang: v.primaryLanguageName,
      jpScale: v.jpScale,
      pctEvangelical: v.percentEvangelical,
      bibleStatus: v.bibleStatus,
    });
    updated++;

    if (!COMMIT) continue;

    // 1) MasterPeople : langue + résumé de statut + provenance referenceData.
    const set = {
      'status.jpScale': v.jpScale,
      'status.leastReached': v.leastReached,
      'status.percentEvangelical': v.percentEvangelical,
      'status.bibleStatus': v.bibleStatus,
      referenceData: {
        source: 'JoshuaProject(API)',
        matchedBy: 'manual-mapping(PeopleID3)',
        matchedName: v.matchedName,
        rop3: v.rop3,
        primaryLanguage: v.primaryLanguageName,
        jpScale: v.jpScale,
        leastReached: v.leastReached,
        percentChristian: v.percentChristian,
        percentEvangelical: v.percentEvangelical,
        bibleStatus: v.bibleStatus,
        updatedAt: new Date(),
      },
    };
    // Ne remplace la langue que si absente ou marquée « non déterminé ».
    if ((!master.primaryLanguageName || /non déterminé/i.test(master.primaryLanguageName)) && v.primaryLanguageName) {
      set.primaryLanguageName = v.primaryLanguageName;
    }
    // Renseigne le ROP3 canonique s'il manque.
    if (!master.rop3 && v.rop3) set.rop3 = v.rop3;

    await MasterPeople.updateOne({ _id: master._id }, { $set: set });

    // 2) PeopleStatus (people_statuses) : c'est de là que `overview.bibleStatus`
    //    et `overview.percentEvangelical` (statusDetail) sont lus. Upsert.
    await PeopleStatus.updateOne(
      { masterPeopleId: master._id },
      {
        $set: {
          jpScale: v.jpScale,
          leastReached: v.leastReached,
          percentEvangelical: v.percentEvangelical,
          percentChristian: v.percentChristian,
          bibleStatus: v.bibleStatus,
          derivedFromSource: 'JoshuaProject(API)',
        },
      },
      { upsert: true }
    );
  }

  // ── Rapport ────────────────────────────────────────────────────────────────
  console.log('--- Aperçu des correspondances ---');
  report.slice(0, 60).forEach((x) => {
    console.log(
      `  • ${x.dmm}  ->  ${x.jp} [${x.peopleId}] | lang=${x.lang ?? '—'} | JPScale=${x.jpScale ?? '—'} | %Evang=${x.pctEvangelical ?? '—'} | Bible=${x.bibleStatus ?? '—'}`
    );
  });
  console.log('\n--- Résumé ---');
  console.log(`${COMMIT ? 'Peuples mis à jour' : 'Peuples qui seraient mis à jour'} : ${updated}`);
  if (notFoundJp.length) {
    console.log(`\nPeopleID3 introuvable côté JP (${notFoundJp.length}) :`);
    notFoundJp.forEach((u) => console.log('   - ' + u));
  }
  if (notFoundMaster.length) {
    console.log(`\nMaster DMM introuvable en base (${notFoundMaster.length}) :`);
    notFoundMaster.forEach((u) => console.log('   - ' + u));
  }
  const noId = rows.length - withId.length;
  if (noId > 0) {
    console.log(`\nLignes sans PeopleID3 exploitable (chosenName vide ou « [-] ») : ${noId}`);
    console.log('   -> complétez la colonne chosenName avec un identifiant JP entre crochets, ex. « Akum [100198] ».');
  }
  if (!COMMIT) {
    console.log('\nDRY-RUN terminé : relancez avec --commit pour écrire en base.');
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('\nÉchec du script :', e && e.message ? e.message : e);
  process.exit(1);
});
