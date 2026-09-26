'use strict';
/**
 * convertNgQuarter.js
 * -------------------
 * Convertit un fichier rapport trimestriel New Generation (.xlsx) en CSV normalisé
 * prêt à l'import dans l'application (format people_groups_import_template + colonnes
 * dbs/com/cat/reportPeriod). Réutilise la logique validée pour FCA 2Q26 :
 *   - lecture des 2 onglets "Data" + "New Engagements"
 *   - exclusion des pays hors zone FCA
 *   - matching des coordonnées : Joshua Project -> CPPI -> centroïde pays
 *   - calcul du statut DMM (non atteint -> pionnier -> mi-parcours -> basculement -> mouvement)
 *
 * USAGE (depuis le dossier backend/) :
 *   node scripts/convertNgQuarter.js <chemin_xlsx> <reportPeriod> [chemin_csv_sortie]
 *
 * EXEMPLES :
 *   node scripts/convertNgQuarter.js "data/FRANCOPHONE CENTRAL AFRICA 3Q26.xlsx" 3Q26
 *   node scripts/convertNgQuarter.js "data/FCA 3Q26.xlsx" 3Q26 data/NG_FCA_3Q26_import.csv
 *
 * Le CSV généré peut ensuite être importé via l'écran "Données > Importer".
 * L'import fait un UPSERT par (nom + pays) : les peuples existants sont mis à jour
 * et un point d'historique daté du trimestre est ajouté (pas de doublon).
 */
const fs = require('fs');
const path = require('path');

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('Le paquet "xlsx" est requis. Lancez ce script depuis le dossier backend/ (où xlsx est installé).');
  process.exit(1);
}

// ---------- arguments ----------
const [, , xlsxArg, periodArg, outArg] = process.argv;
if (!xlsxArg || !periodArg) {
  console.error('USAGE: node scripts/convertNgQuarter.js <chemin_xlsx> <reportPeriod> [chemin_csv_sortie]');
  console.error('EX:    node scripts/convertNgQuarter.js "data/FRANCOPHONE CENTRAL AFRICA 3Q26.xlsx" 3Q26');
  process.exit(1);
}
const NG_XLSX = xlsxArg;
const REPORT_PERIOD = String(periodArg).trim();
const OUT_CSV = outArg || path.join('data', `NG_FCA_${REPORT_PERIOD}_import.csv`);
const OUT_REPORT = OUT_CSV.replace(/\.csv$/i, '') + '_match_report.md';

// Sources de coordonnées (mêmes fichiers que pour 2Q26)
const JP_CSV = path.join('data', 'AllPeoplesInCountry.csv');
const CPPI_CSV = path.join('data', 'people_groups.csv');

// ---------- zone FCA ----------
const FCA_KEEP = new Set(['Cameroon', 'Central African Republic', 'Chad', 'Congo', 'Congo (DRC)', 'Equatorial Guinea', 'Gabon']);
const COUNTRY_CENTROID = {
  'Cameroon': [5.69, 12.74],
  'Central African Republic': [6.61, 20.94],
  'Chad': [15.45, 18.73],
  'Congo': [-0.66, 14.90],
  'Congo (DRC)': [-2.88, 23.66],
  'Equatorial Guinea': [1.65, 10.27],
  'Gabon': [-0.80, 11.61],
};
const CPPI_ISO = {
  'Cameroon': 'CMR', 'Central African Republic': 'CAF', 'Chad': 'TCD',
  'Congo': 'COG', 'Congo (DRC)': 'COD', 'Equatorial Guinea': 'GNQ', 'Gabon': 'GAB',
};

// ---------- helpers ----------
function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}
function s(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function csvField(v) {
  const str = (v === null || v === undefined) ? '' : String(v);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}
function dmmStatus(total) {
  const t = toNum(total);
  if (t === null || t === 0) return 'unreached';
  if (t <= 33) return 'pioneer';
  if (t <= 66) return 'midway';
  if (t <= 99) return 'tipping-point';
  return 'dmm';
}
function hashFrac(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
function jitter(name, base, salt) {
  return base + (hashFrac(String(name) + '|' + salt) - 0.5) * 0.04; // ±0.02
}
function normBasic(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
}
function canonicalReduce(rawName) {
  const n = normBasic(rawName);
  if (/^pygm(y|ee|e)\b/.test(n)) return 'pygmy';
  const baseTokens = ['mandja', 'fulani', 'londo', 'madja', 'ruto', 'bana', 'kapsiki'];
  for (const b of baseTokens) { if (n === b || n.startsWith(b + ' ')) return b; }
  return n;
}
function bigrams(str) {
  const t = normBasic(str).replace(/\s+/g, ''); const set = [];
  for (let i = 0; i < t.length - 1; i++) set.push(t.slice(i, i + 2));
  return set;
}
function diceSim(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (A.length === 0 && B.length === 0) return a === b ? 1 : 0;
  if (A.length === 0 || B.length === 0) return 0;
  const counts = {}; for (const g of A) counts[g] = (counts[g] || 0) + 1;
  let inter = 0; for (const g of B) { if (counts[g] > 0) { inter++; counts[g]--; } }
  return (2 * inter) / (A.length + B.length);
}

// ---------- load JP ----------
if (!fs.existsSync(JP_CSV)) { console.error('Introuvable: ' + JP_CSV); process.exit(1); }
const jpLines = fs.readFileSync(JP_CSV, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
const jpHeader = jpLines[2].split(';'); const col = {};
jpHeader.forEach((h, i) => { col[h.trim()] = i; });
const jpRows = [];
for (let i = 3; i < jpLines.length; i++) {
  const line = jpLines[i]; if (!line || !line.trim()) continue;
  const p = line.split(';');
  jpRows.push({
    Ctry: s(p[col['Ctry']]),
    PeopNameAcrossCountries: s(p[col['PeopNameAcrossCountries']]),
    PeopNameInCountry: s(p[col['PeopNameInCountry']]),
    JPScale: s(p[col['JPScale']]), LeastReached: s(p[col['LeastReached']]),
    PercentEvangelical: s(p[col['PercentEvangelical']]),
    PrimaryLanguageName: s(p[col['PrimaryLanguageName']]),
    PrimaryReligion: s(p[col['PrimaryReligion']]),
    Latitude: p[col['Latitude']] !== undefined ? s(p[col['Latitude']]) : '',
    Longitude: p[col['Longitude']] !== undefined ? s(p[col['Longitude']]) : '',
  });
}
const congoCtry = Array.from(new Set(jpRows.map(r => r.Ctry).filter(c => /congo/i.test(c)))).sort();
const drcMatch = congoCtry.find(c => /democratic/i.test(c)) || 'Congo, Democratic Republic of';
const ropCongo = congoCtry.find(c => !/democratic|dem\./i.test(c)) || 'Congo, Republic of the';
const jpByCtry = {};
for (const r of jpRows) { (jpByCtry[r.Ctry] = jpByCtry[r.Ctry] || []).push(r); }

// ---------- load CPPI ----------
const cppiByIso = {};
try {
  const cLines = fs.readFileSync(CPPI_CSV, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const ch = cLines[0].split(';'); const cc = {};
  ch.forEach((h, i) => { cc[h.trim()] = i; });
  for (let i = 1; i < cLines.length; i++) {
    const line = cLines[i]; if (!line || !line.trim()) continue;
    const p = line.split(';'); const iso = s(p[cc['ISOalpha3']]); if (!iso) continue;
    (cppiByIso[iso] = cppiByIso[iso] || []).push({
      Name: s(p[cc['Name']]), NmDisp: cc['NmDisp'] !== undefined ? s(p[cc['NmDisp']]) : '',
      NmAlt: cc['NmAlt'] !== undefined ? s(p[cc['NmAlt']]) : '',
      Latitude: cc['Latitude'] !== undefined ? s(p[cc['Latitude']]) : '',
      Longitude: cc['Longitude'] !== undefined ? s(p[cc['Longitude']]) : '',
    });
  }
} catch (e) { /* CPPI optionnel */ }

function normalizeCountry(raw) {
  const low = s(raw).replace(/\s+/g, ' ').toLowerCase();
  if (/^camero(u|o)n/.test(low)) return { jp: 'Cameroon', display: 'Cameroon' };
  if (/central african/.test(low)) return { jp: 'Central African Republic', display: 'Central African Republic' };
  if (/^chad|tchad/.test(low)) return { jp: 'Chad', display: 'Chad' };
  if (/dem/.test(low) && /congo/.test(low)) return { jp: drcMatch, display: 'Congo (DRC)' };
  if (/congo/.test(low)) return { jp: ropCongo, display: 'Congo' };
  if (/equatorial guinea|guin.*e.*quatoriale/.test(low)) return { jp: 'Equatorial Guinea', display: 'Equatorial Guinea' };
  if (/^gabon/.test(low)) return { jp: 'Gabon', display: 'Gabon' };
  return { jp: s(raw), display: s(raw) };
}

const KNOWN_PYGMY = ['baka', 'bakola', 'aka', 'bedzan', 'bagyeli', 'gyele', 'babongo', 'bongo', 'twa'];
function matchJp(displayNorm, rawName) {
  const pool = jpByCtry[displayNorm.jp] || [];
  const nName = normBasic(rawName); const canon = canonicalReduce(rawName);
  for (const r of pool) if (normBasic(r.PeopNameInCountry) === nName || normBasic(r.PeopNameAcrossCountries) === nName)
    return { jp: r, band: 'AUTO' };
  for (const r of pool) if (canonicalReduce(r.PeopNameInCountry) === canon || canonicalReduce(r.PeopNameAcrossCountries) === canon)
    return { jp: r, band: (canon === nName ? 'AUTO' : 'REVIEW') };
  if (canon === 'pygmy') {
    let cand = pool.find(r => /pygm/i.test(r.PeopNameInCountry) || /pygm/i.test(r.PeopNameAcrossCountries))
      || pool.find(r => KNOWN_PYGMY.some(k => normBasic(r.PeopNameInCountry).split(' ').includes(k)));
    if (cand) return { jp: cand, band: 'REVIEW' };
  }
  let best = null, bestSim = 0;
  for (const r of pool) {
    const sim = Math.max(diceSim(canon, canonicalReduce(r.PeopNameInCountry)), diceSim(nName, normBasic(r.PeopNameInCountry)));
    if (sim > bestSim) { bestSim = sim; best = r; }
  }
  if (best && bestSim >= 0.85) return { jp: best, band: 'AUTO' };
  if (best && bestSim >= 0.60) return { jp: best, band: 'REVIEW' };
  return null;
}
function matchCppi(display, rawName) {
  const iso = CPPI_ISO[display]; if (!iso) return null;
  const pool = cppiByIso[iso] || []; const nName = normBasic(rawName); const canon = canonicalReduce(rawName);
  for (const r of pool) if ((normBasic(r.Name) === nName || normBasic(r.NmDisp) === nName || normBasic(r.NmAlt) === nName) && r.Latitude && r.Longitude)
    return { jp: r, name: r.Name };
  for (const r of pool) if ((canonicalReduce(r.Name) === canon) && r.Latitude && r.Longitude)
    return { jp: r, name: r.Name };
  return null;
}

// ---------- parse xlsx ----------
if (!fs.existsSync(NG_XLSX)) { console.error('Introuvable: ' + NG_XLSX); process.exit(1); }
const wb = XLSX.readFile(NG_XLSX);
function sheetRows(name) { const ws = wb.Sheets[name]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true }) : []; }

const engagements = [];
// "Data" sheet: label row index 1; Country idx6, Engagment_Name idx8, People_Group idx9, DBS10 COM11 CAT12 TOTAL13 GEN14
const dataRows = sheetRows('Data');
for (let i = 2; i < dataRows.length; i++) {
  const r = dataRows[i]; if (!r) continue;
  const country = s(r[6]); const pg = s(r[9]); const engName = s(r[8]);
  if (!country && !pg) continue; // footer
  const name = pg || engName; if (!name) continue;
  engagements.push({ source: 'Data', rawCountry: country || engName.split('-')[0], name,
    DBS: r[10], COM: r[11], CAT: r[12], TOTAL: r[13], GEN: r[14] });
}
// "New Engagements" sheet: Country idx5, Engagment_Name idx7 (people name here), DBS9 COM10 CAT11 TOTAL12 GEN13
const newRows = sheetRows('New Engagements');
for (let i = 2; i < newRows.length; i++) {
  const r = newRows[i]; if (!r) continue;
  const country = s(r[5]); const engName = s(r[7]); if (!country && !engName) continue;
  let name = engName; const dash = engName.indexOf('-');
  if (dash > 0) { const prefix = engName.slice(0, dash).trim(); if (normalizeCountry(prefix).jp === normalizeCountry(country).jp) name = engName.slice(dash + 1).trim(); }
  if (!name) continue;
  engagements.push({ source: 'New Engagements', rawCountry: country || engName.split('-')[0], name,
    DBS: r[9], COM: r[10], CAT: r[11], TOTAL: r[12], GEN: r[13] });
}

// ---------- process ----------
const rows = []; const excluded = []; const centroidRows = [];
const bandCount = { AUTO_JP: 0, REVIEW_JP: 0, REVIEW_CPPI: 0, CENTROID: 0 };
for (const eng of engagements) {
  const norm = normalizeCountry(eng.rawCountry);
  if (!FCA_KEEP.has(norm.display)) { excluded.push({ name: eng.name, display: norm.display }); continue; }
  const jpM = matchJp(norm, eng.name);
  let lat, lng, band, matchedName = '', jp = null;
  if (jpM && jpM.jp.Latitude && jpM.jp.Longitude && !isNaN(Number(jpM.jp.Latitude))) {
    band = jpM.band === 'AUTO' ? 'AUTO_JP' : 'REVIEW_JP';
    lat = Number(jpM.jp.Latitude); lng = Number(jpM.jp.Longitude); jp = jpM.jp; matchedName = jp.PeopNameInCountry;
  } else {
    const cp = matchCppi(norm.display, eng.name);
    if (cp && cp.jp.Latitude && cp.jp.Longitude && !isNaN(Number(cp.jp.Latitude))) {
      band = 'REVIEW_CPPI'; lat = Number(cp.jp.Latitude); lng = Number(cp.jp.Longitude); matchedName = cp.name;
    } else {
      band = 'CENTROID'; const c = COUNTRY_CENTROID[norm.display];
      lat = c[0] + (hashFrac(eng.name + '|lat') - 0.5) * 0.30;
      lng = c[1] + (hashFrac(eng.name + '|lng') - 0.5) * 0.30;
      centroidRows.push({ name: eng.name, display: norm.display });
    }
  }
  bandCount[band]++;
  rows.push({ eng, norm, band, lat, lng, jp, matchedName });
}
// jitter shared JP/CPPI coords
const groups = {};
for (const r of rows) if (r.band !== 'CENTROID') { const k = r.lat.toFixed(5) + ',' + r.lng.toFixed(5); (groups[k] = groups[k] || []).push(r); }
for (const k in groups) { const g = groups[k]; if (g.length > 1) g.forEach((r, idx) => { if (idx > 0) { r.lat = jitter(r.eng.name, r.lat, 'lat'); r.lng = jitter(r.eng.name, r.lng, 'lng'); } }); }

// ---------- write CSV ----------
const headers = ['name','latitude','longitude','villageName','population','numberOfChurches','churchGeneration','dbs','com','cat','reportPeriod','engagementStatus','region','country','language','religion','description'];
const out = [headers.join(',')];
for (const r of rows) {
  const { eng, norm } = r;
  const gen = (eng.GEN === null || eng.GEN === undefined || eng.GEN === '') ? '' : s(eng.GEN);
  const metrics = `DBS=${s(eng.DBS)}, COM=${s(eng.COM)}, CAT=${s(eng.CAT)}, Churches=${s(eng.TOTAL)}, Gen=${gen}`;
  let desc;
  if (r.band === 'AUTO_JP' || r.band === 'REVIEW_JP')
    desc = `NG engagement ${REPORT_PERIOD} | ${metrics} | JP match: ${r.jp.PeopNameInCountry} (${r.band}, JPScale=${r.jp.JPScale}, %Evang=${r.jp.PercentEvangelical})`;
  else if (r.band === 'REVIEW_CPPI')
    desc = `NG engagement ${REPORT_PERIOD} | ${metrics} | CPPI match: ${r.matchedName} — coords from CPPI`;
  else
    desc = `NG engagement ${REPORT_PERIOD} | ${metrics} | CENTROID placeholder (approx — à affiner)`;
  const lang = r.jp ? r.jp.PrimaryLanguageName : '';
  const rel = r.jp ? r.jp.PrimaryReligion : '';
  out.push([
    eng.name, r.lat.toFixed(5), r.lng.toFixed(5), '', '',
    (eng.TOTAL === null || eng.TOTAL === undefined ? '' : s(eng.TOTAL)), gen,
    (eng.DBS == null ? '0' : s(eng.DBS)), (eng.COM == null ? '0' : s(eng.COM)), (eng.CAT == null ? '0' : s(eng.CAT)),
    REPORT_PERIOD, dmmStatus(eng.TOTAL), 'Francophone Central Africa', norm.display, lang, rel, desc
  ].map(csvField).join(','));
}
fs.writeFileSync(OUT_CSV, out.join('\r\n') + '\r\n', 'utf8');

// ---------- report ----------
let md = `# NG FCA ${REPORT_PERIOD} — Rapport de conversion\n\nGénéré: ${new Date().toISOString()}\nSource: ${NG_XLSX}\n\n`;
md += `- Lignes FCA gardées: **${rows.length}**\n- Exclues (hors FCA): **${excluded.length}**\n`;
md += `- Coordonnées JP exact: ${bandCount.AUTO_JP} | JP approx: ${bandCount.REVIEW_JP} | CPPI: ${bandCount.REVIEW_CPPI} | Centroïde: ${bandCount.CENTROID}\n\n`;
if (excluded.length) { md += `## Exclues (hors zone FCA)\n` + excluded.map(x => `- [${x.display}] ${x.name}`).join('\n') + '\n\n'; }
if (centroidRows.length) { md += `## Placeholders CENTROID (à affiner)\n` + centroidRows.map(x => `- [${x.display}] ${x.name}`).join('\n') + '\n'; }
fs.writeFileSync(OUT_REPORT, md, 'utf8');

console.log(`✅ Converti: ${rows.length} lignes FCA (période ${REPORT_PERIOD}).`);
console.log(`   Coordonnées — JP exact ${bandCount.AUTO_JP}, JP approx ${bandCount.REVIEW_JP}, CPPI ${bandCount.REVIEW_CPPI}, centroïde ${bandCount.CENTROID}.`);
console.log(`   Exclues hors FCA: ${excluded.length}.`);
console.log(`📄 CSV: ${OUT_CSV}`);
console.log(`📋 Rapport: ${OUT_REPORT}`);
console.log(`\n➡️  Importez ${OUT_CSV} via "Données > Importer" (upsert par nom+pays, pas de doublon).`);
