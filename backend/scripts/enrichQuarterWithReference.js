'use strict';
/**
 * enrichQuarterWithReference.js
 * -----------------------------
 * Enrichit un CSV trimestriel (produit par convertNgQuarter.js) avec les données
 * du RÉFÉRENTIEL déjà importé en base (importPeoplesReference.js) :
 *   - remplit villageName à partir du référentiel (clé de l'upsert nom+village+pays)
 *   - remplace les coordonnées "centroïde" approximatives par les VRAIES coordonnées
 *     du village de référence quand une correspondance unique existe
 *
 * POURQUOI : les rapports NG trimestriels n'ont pas de colonne village. Sans village,
 * l'upsert de l'import (nom+village+pays) ne rattache pas les métriques aux peuples
 * du référentiel. Ce script fait le pont.
 *
 * RÈGLES DE RATTACHEMENT (par nom de peuple + pays, insensible à la casse) :
 *   - 1 seul village de référence  -> villageName + coords injectés (rattachement direct)
 *   - plusieurs villages           -> laissé tel quel + SIGNALÉ dans le rapport pour arbitrage
 *   - aucun village                -> laissé tel quel (nouveau peuple, sera créé à l'import)
 *
 * USAGE (depuis backend/) :
 *   node scripts/enrichQuarterWithReference.js data/NG_FCA_3Q26_import.csv [sortie.csv]
 *
 * Produit : <entrée>_enriched.csv (ou le chemin de sortie fourni) + un rapport .md
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const PeopleGroup = require('../models/PeopleGroup');

const inArg = process.argv[2];
if (!inArg) {
  console.error('USAGE: node scripts/enrichQuarterWithReference.js <csv_entrée> [csv_sortie]');
  process.exit(1);
}
const IN_CSV = path.isAbsolute(inArg) ? inArg : path.join(process.cwd(), inArg);
const OUT_CSV = process.argv[3]
  ? (path.isAbsolute(process.argv[3]) ? process.argv[3] : path.join(process.cwd(), process.argv[3]))
  : IN_CSV.replace(/\.csv$/i, '') + '_enriched.csv';
const OUT_REPORT = OUT_CSV.replace(/\.csv$/i, '') + '_report.md';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// --- CSV parsing minimal (gère les champs entre guillemets) ---
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* ignore */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}
function csvField(v) {
  const str = (v === null || v === undefined) ? '' : String(v);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

async function run() {
  if (!fs.existsSync(IN_CSV)) { console.error('Introuvable: ' + IN_CSV); process.exit(1); }
  const rows = parseCsv(fs.readFileSync(IN_CSV, 'utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 2) { console.error('CSV vide.'); process.exit(1); }

  const header = rows[0].map(h => h.trim());
  const idx = {}; header.forEach((h, i) => { idx[h.toLowerCase()] = i; });
  const iName = idx['name'], iCountry = idx['country'];
  const iVillage = idx['villagename'];
  const iLat = idx['latitude'], iLng = idx['longitude'];
  if (iName === undefined || iCountry === undefined) {
    console.error('Le CSV doit contenir au moins les colonnes name et country.'); process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting-map';
  console.log('🔌 Connexion à MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connecté');

  // Charge le référentiel : peuples issus de l'import référentiel, groupés par nom+pays
  const refs = await PeopleGroup.find(
    { 'sourceData.referenceImport': true },
    { name: 1, villageName: 1, country: 1, 'location.coordinates': 1 }
  ).lean();

  const byKey = {}; // "nom|pays" -> [{village, lng, lat}]
  for (const r of refs) {
    const key = norm(r.name) + '|' + norm(r.country);
    (byKey[key] = byKey[key] || []).push({
      village: r.villageName || '',
      lng: r.location && r.location.coordinates ? r.location.coordinates[0] : null,
      lat: r.location && r.location.coordinates ? r.location.coordinates[1] : null,
    });
  }

  const stats = { total: 0, linkedUnique: 0, ambiguous: 0, noMatch: 0 };
  const ambiguousList = [], linkedList = [];

  // S'assure que villagename existe dans l'entête de sortie
  let outHeader = header.slice();
  let villageCol = iVillage;
  if (villageCol === undefined) { outHeader.push('villageName'); villageCol = outHeader.length - 1; }

  const outRows = [outHeader];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r].slice();
    while (row.length < outHeader.length) row.push('');
    const name = row[iName], country = row[iCountry];
    if (!name) { outRows.push(row); continue; }
    stats.total++;

    const key = norm(name) + '|' + norm(country);
    const matches = byKey[key] || [];

    if (matches.length === 1) {
      const m = matches[0];
      row[villageCol] = m.village || row[villageCol] || '';
      if (m.lat != null && m.lng != null && iLat !== undefined && iLng !== undefined) {
        row[iLat] = String(m.lat);
        row[iLng] = String(m.lng);
      }
      stats.linkedUnique++;
      linkedList.push({ name, country, village: m.village });
    } else if (matches.length > 1) {
      stats.ambiguous++;
      ambiguousList.push({ name, country, villages: matches.map(m => m.village).filter(Boolean) });
      // on ne devine pas : laissé tel quel pour arbitrage manuel
    } else {
      stats.noMatch++;
    }
    outRows.push(row);
  }

  const outText = outRows.map(r => r.map(csvField).join(',')).join('\r\n') + '\r\n';
  fs.writeFileSync(OUT_CSV, '\ufeff' + outText, 'utf8');

  // Rapport
  let md = `# Enrichissement trimestriel via référentiel\n\nGénéré: ${new Date().toISOString()}\nEntrée: ${IN_CSV}\nSortie: ${OUT_CSV}\n\n`;
  md += `- Lignes traitées: **${stats.total}**\n`;
  md += `- Rattachées à un village unique: **${stats.linkedUnique}**\n`;
  md += `- Ambiguës (plusieurs villages — à arbitrer): **${stats.ambiguous}**\n`;
  md += `- Sans correspondance dans le référentiel (nouveaux peuples): **${stats.noMatch}**\n\n`;
  if (ambiguousList.length) {
    md += `## À arbitrer (plusieurs villages pour ce peuple)\n\n| Peuple | Pays | Villages candidats |\n|---|---|---|\n`;
    md += ambiguousList.map(a => `| ${a.name} | ${a.country} | ${a.villages.join(' ; ')} |`).join('\n') + '\n\n';
    md += `> Pour ces lignes, éditez manuellement la colonne villageName du CSV enrichi avant l'import,\n> ou dupliquez la ligne (une par village) selon la réalité terrain.\n\n`;
  }
  fs.writeFileSync(OUT_REPORT, md, 'utf8');

  console.log('\n═══════════════════════════════════════════════');
  console.log('  ENRICHISSEMENT TERMINÉ');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Lignes traitées         : ${stats.total}`);
  console.log(`  ✅ Village unique       : ${stats.linkedUnique}`);
  console.log(`  ⚠️  Ambiguës (à arbitrer): ${stats.ambiguous}`);
  console.log(`  ➕ Nouveaux peuples     : ${stats.noMatch}`);
  console.log('───────────────────────────────────────────────');
  console.log(`  📄 CSV enrichi : ${OUT_CSV}`);
  console.log(`  📋 Rapport     : ${OUT_REPORT}`);
  console.log('\n➡️  Importez le CSV enrichi via "Données > Importer" (upsert nom+village+pays).');

  await mongoose.disconnect();
  console.log('🔌 Déconnecté de MongoDB');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
