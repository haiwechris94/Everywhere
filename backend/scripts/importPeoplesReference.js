'use strict';
/**
 * importPeoplesReference.js
 * -------------------------
 * Importe un fichier RÉFÉRENTIEL de peuples (.xlsx) — le "socle géographique" —
 * dans l'application Church Planting Map. Pays-AGNOSTIQUE : le pays vient de la
 * colonne "Country" de chaque ligne (Cameroun, Tchad, RCA, Gabon, ...).
 *
 * Ce format est plus riche que les rapports NG trimestriels : il contient de
 * vraies coordonnées GPS par village + la hiérarchie administrative complète.
 *
 * ONGLET LU par défaut : "PGs" (le premier onglet trouvé sinon).
 * L'onglet "Error" (peuples sans coordonnées) est IGNORÉ.
 *
 * COLONNES ATTENDUES (1re ligne = entêtes) :
 *   Region, Country, People_Group, Village, District, Department, Province,
 *   Affinity_Group, Language, Religious_Background, Urban_Rural, Start_Date,
 *   Population_Size, E2M_Stage, Latitude, Longitude, Notes
 *
 * MAPPING vers le modèle PeopleGroup :
 *   People_Group        -> name
 *   Village             -> villageName
 *   District            -> admin3   (arrondissement)
 *   Department          -> admin2   (département)
 *   Province            -> region
 *   Language            -> language
 *   Religious_Background-> religion
 *   Population_Size     -> population (1er nombre extrait) + texte original conservé dans description
 *   Latitude/Longitude  -> location.coordinates [lng, lat]
 *   Country             -> country (+ countryCode alpha-2 déduit)
 *   Notes / Affinity_Group / Urban_Rural / Start_Date / E2M_Stage -> description + sourceData (brut)
 *
 * UPSERT par (name + villageName + country) insensible à la casse : réimporter
 * ne crée pas de doublon, met à jour le socle géographique. Les métriques
 * trimestrielles (dbs/com/cat/reportPeriod) ne sont PAS touchées ici — elles
 * viennent des imports trimestriels.
 *
 * USAGE (depuis backend/) :
 *   node scripts/importPeoplesReference.js "data/Cameroon_PGs.xlsx" [--dry-run] [--sheet=PGs]
 *
 * Options :
 *   --dry-run     Aperçu sans écrire en base
 *   --sheet=NOM   Onglet à lire (défaut : PGs)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Le paquet "xlsx" est requis. Lancez ce script depuis le dossier backend/.');
  process.exit(1);
}

const PeopleGroup = require('../models/PeopleGroup');
const User = require('../models/User');

// ---------- arguments ----------
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const sheetArg = (args.find(a => a.startsWith('--sheet=')) || '').split('=')[1] || 'PGs';
const xlsxArg = args.find(a => !a.startsWith('--'));
if (!xlsxArg) {
  console.error('USAGE: node scripts/importPeoplesReference.js <chemin_xlsx> [--dry-run] [--sheet=PGs]');
  process.exit(1);
}
const XLSX_PATH = path.isAbsolute(xlsxArg) ? xlsxArg : path.join(process.cwd(), xlsxArg);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'chrishaiwe@gmail.com';

// ---------- pays -> code ISO alpha-2 (modèle attend alpha-2) ----------
const COUNTRY_ALPHA2 = {
  'Cameroon': 'CM', 'Cameroun': 'CM',
  'Central African Republic': 'CF', 'Centrafrique': 'CF', 'République Centrafricaine': 'CF',
  'Chad': 'TD', 'Tchad': 'TD',
  'Congo': 'CG', 'Republic of the Congo': 'CG',
  'Congo (DRC)': 'CD', 'Democratic Republic of the Congo': 'CD',
  'Equatorial Guinea': 'GQ', 'Guinée Équatoriale': 'GQ',
  'Gabon': 'GA',
};

// ---------- helpers ----------
function s(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

/** Extrait le 1er nombre entier d'une chaîne libre (ex "≈2 800 (Cameroun)" -> 2800). */
function extractFirstNumber(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number' && !isNaN(v)) return Math.round(v);
  const str = String(v);
  // capture un groupe de chiffres pouvant contenir des espaces/points/virgules de milliers
  const m = str.match(/\d[\d\s.,]*/);
  if (!m) return 0;
  const digits = m[0].replace(/[\s.,]/g, '');
  const n = parseInt(digits, 10);
  return isNaN(n) ? 0 : n;
}

function toCoord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? NaN : n;
}

/** Statut d'engagement à partir du nombre d'églises (aligné sur la route d'import). */
function engagementFromChurches(churches) {
  const c = parseInt(churches, 10) || 0;
  if (c === 0) return 'unreached';
  if (c <= 33) return 'pioneer';
  if (c <= 66) return 'midway';
  if (c <= 99) return 'tipping-point';
  return 'dmm';
}

/** Trouve l'index d'une colonne par nom (insensible à la casse / underscores). */
function buildColIndex(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const key = s(h).toLowerCase().replace(/[\s_]+/g, '');
    if (key) idx[key] = i;
  });
  return idx;
}
function col(row, idx, name) {
  const key = name.toLowerCase().replace(/[\s_]+/g, '');
  const i = idx[key];
  return (i === undefined) ? '' : row[i];
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Import RÉFÉRENTIEL peuples (socle géographique, multi-pays)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Fichier : ${XLSX_PATH}`);
  console.log(`  Onglet  : ${sheetArg}`);
  console.log(`  Mode    : ${isDryRun ? 'DRY RUN (aucune écriture)' : 'IMPORT RÉEL'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(XLSX_PATH)) { console.error('Introuvable: ' + XLSX_PATH); process.exit(1); }

  const wb = XLSX.readFile(XLSX_PATH);
  const sheetName = wb.SheetNames.includes(sheetArg) ? sheetArg : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
  if (rows.length < 2) { console.error('Onglet vide ou sans données: ' + sheetName); process.exit(1); }

  const idx = buildColIndex(rows[0]);

  const stats = {
    total: 0, created: 0, updated: 0, skippedNoCoord: 0, skippedNoName: 0, errors: 0,
    byCountry: {}, byStatus: {}, byRegion: {},
  };

  let adminUserId = new mongoose.Types.ObjectId();
  if (!isDryRun) {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connecté\n');
    let adminUser = await User.findOne({ email: ADMIN_EMAIL }) || await User.findOne({ role: 'admin' });
    if (adminUser) { adminUserId = adminUser._id; console.log(`👤 Admin: ${adminUser.email || adminUser.name}\n`); }
    else console.log('⚠️  Aucun admin trouvé — utilisation d\'un ObjectId placeholder pour createdBy.\n');
  }

  try {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const name = s(col(row, idx, 'People_Group'));
      const country = s(col(row, idx, 'Country'));
      if (!name && !country) continue; // ligne vide / footer
      stats.total++;

      if (!name) { stats.skippedNoName++; continue; }

      const lat = toCoord(col(row, idx, 'Latitude'));
      const lng = toCoord(col(row, idx, 'Longitude'));
      const validCoord = !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
      if (!validCoord) { stats.skippedNoCoord++; continue; } // pas de coords -> onglet Error non importé

      const villageName = s(col(row, idx, 'Village'));
      const admin3 = s(col(row, idx, 'District'));
      const admin2 = s(col(row, idx, 'Department'));
      const region = s(col(row, idx, 'Province')) || s(col(row, idx, 'Region'));
      const language = s(col(row, idx, 'Language'));
      const religion = s(col(row, idx, 'Religious_Background'));
      const affinity = s(col(row, idx, 'Affinity_Group'));
      const urbanRural = s(col(row, idx, 'Urban_Rural'));
      const startDate = s(col(row, idx, 'Start_Date'));
      const e2mStage = s(col(row, idx, 'E2M_Stage'));
      const notes = s(col(row, idx, 'Notes'));
      const popRaw = col(row, idx, 'Population_Size');
      const population = extractFirstNumber(popRaw);
      const popText = s(popRaw);
      const countryCode = COUNTRY_ALPHA2[country] || '';

      // description lisible : notes + contexte + population textuelle originale
      const descParts = [];
      if (notes) descParts.push(notes);
      if (popText) descParts.push(`Population (source): ${popText}`);
      if (affinity) descParts.push(`Groupe d'affinité: ${affinity}`);
      if (urbanRural) descParts.push(`Milieu: ${urbanRural}`);
      const description = descParts.join(' | ').slice(0, 1990);

      // On préserve TOUT le brut dans sourceData (traçabilité + champs non modélisés)
      const sourceData = {
        referenceImport: true,
        village: villageName, district: admin3, department: admin2, province: region,
        affinityGroup: affinity, urbanRural, startDate, e2mStage,
        populationText: popText, notes,
      };

      const status = engagementFromChurches(0); // référentiel = pas encore de métriques -> unreached par défaut

      stats.byCountry[country || '—'] = (stats.byCountry[country || '—'] || 0) + 1;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      if (region) stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;

      if (isDryRun) { stats.created++; continue; }

      try {
        // UPSERT par (name + villageName + country) — insensible à la casse
        const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const query = {
          name: { $regex: new RegExp(`^${esc(name)}$`, 'i') },
          country: { $regex: new RegExp(`^${esc(country)}$`, 'i') },
        };
        query.villageName = villageName
          ? { $regex: new RegExp(`^${esc(villageName)}$`, 'i') }
          : { $in: [null, ''] };

        const existing = await PeopleGroup.findOne(query);

        if (existing) {
          existing.villageName = villageName || existing.villageName;
          existing.admin2 = admin2 || existing.admin2;
          existing.admin3 = admin3 || existing.admin3;
          existing.region = region || existing.region;
          existing.country = country || existing.country;
          if (countryCode) existing.countryCode = countryCode;
          if (language) existing.language = language;
          if (religion) existing.religion = religion;
          if (population) existing.population = population;
          if (description) existing.description = description;
          existing.location = { type: 'Point', coordinates: [lng, lat] };
          existing.sourceData = Object.assign({}, existing.sourceData, sourceData);
          existing.updatedBy = adminUserId;
          await existing.save();
          stats.updated++;
        } else {
          const doc = new PeopleGroup({
            name, villageName, description,
            location: { type: 'Point', coordinates: [lng, lat] },
            status, engagementStatus: status,
            population,
            language, religion,
            region, country, countryCode, admin2, admin3,
            source: 'DMM',
            sourceData,
            createdBy: adminUserId,
            approved: true, approvedBy: adminUserId, approvedAt: new Date(),
          });
          await doc.save();
          stats.created++;
        }
      } catch (err) {
        stats.errors++;
        if (stats.errors <= 10) console.log(`   ❌ Ligne ${i + 1} (${name} / ${villageName}): ${err.message}`);
      }
    }

    // ---------- résumé ----------
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  RÉSUMÉ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Lignes traitées      : ${stats.total}`);
    console.log(`  ✅ Créés             : ${stats.created}`);
    console.log(`  🔄 Mis à jour        : ${stats.updated}`);
    console.log(`  ⏭️  Sans coordonnées  : ${stats.skippedNoCoord} (onglet Error non importé)`);
    console.log(`  ⏭️  Sans nom          : ${stats.skippedNoName}`);
    console.log(`  ❌ Erreurs           : ${stats.errors}`);
    console.log('───────────────────────────────────────────────────────────────');
    console.log('  Par pays :');
    for (const [k, v] of Object.entries(stats.byCountry).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(28)} ${v}`);
    console.log('  Par statut :');
    for (const [k, v] of Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(28)} ${v}`);
    console.log('═══════════════════════════════════════════════════════════════');
    if (isDryRun) console.log('\n⚠️  DRY RUN — aucune donnée écrite. Relancez sans --dry-run pour importer.');
  } catch (error) {
    console.error('\n❌ Import échoué:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (!isDryRun) { await mongoose.disconnect(); console.log('\n🔌 Déconnecté de MongoDB'); }
  }
}

run();
