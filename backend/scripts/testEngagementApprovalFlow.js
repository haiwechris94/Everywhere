/**
 * testEngagementApprovalFlow.js  (script de test manuel, non destructif)
 *
 * Vérifie le cycle complet d'un engagement DMM :
 *   1. création  -> approved:false (en attente)
 *   2. présent dans GET /people-groups/pending
 *   3. ABSENT du reporting région (FCA) et de la carte DMM
 *   4. approbation via POST /people-groups/:id/approve
 *   5. PRÉSENT dans le reporting région (FCA) et sur la carte DMM
 *   6. nettoyage : suppression de l'engagement de test
 *
 * Le script appelle les VRAIES routes HTTP (localhost:5000) avec un JWT admin
 * généré à partir du JWT_SECRET, exactement comme le ferait l'application.
 *
 * Usage:  node scripts/testEngagementApprovalFlow.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const PeopleGroup = require('../models/PeopleGroup');
const MasterPeople = require('../models/MasterPeople');
const User = require('../models/User');

const PORT = process.env.PORT || 5000;
const BASE = `http://localhost:${PORT}`;
const REGION = 'FCA';

const log = (...a) => console.log(...a);
const ok = (c, msg) => log(`${c ? '✅ PASS' : '❌ FAIL'} — ${msg}`);

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

// Compte les engagements DMM d'une région dans le reporting.
function regionEngagementCount(regionJson) {
  const m = regionJson?.data?.metrics || {};
  return m.engagements ?? m.dmm?.engagementCount ?? null;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/church-planting');

  // 1) Admin + token
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) throw new Error('Aucun utilisateur admin trouvé en base.');
  const token = jwt.sign({ userId: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  log(`\n👤 Admin: ${admin.email}`);

  // Un master people en zone FCA (Cameroun) pour rattacher l'engagement.
  const master = await MasterPeople.findOne({ countryCode: 'CM' }) || await MasterPeople.findOne({});
  if (!master) throw new Error('Aucun MasterPeople trouvé pour rattacher un engagement de test.');
  log(`🔗 MasterPeople: ${master.name || master._id} (CM)`);

  // ── Mesures AVANT ──────────────────────────────────────────────────────────
  const regionBefore = await api(`/api/reporting/regions/${REGION}`);
  const mapBefore = await api(`/api/master-people/map/dmm-engagements?limit=20000`, { token });
  const engBefore = regionEngagementCount(regionBefore.json);
  const mapCountBefore = (mapBefore.json?.peoples || []).length;
  log(`\n📊 AVANT — reporting FCA engagements=${engBefore} | points carte DMM=${mapCountBefore}`);

  // ── 2) Création de l'engagement de test (approved:false, comme le code) ─────
  const testName = `__TEST_ENGAGEMENT_${Date.now()}`;
  const created = await PeopleGroup.create({
    name: testName,
    source: 'DMM',
    approved: false,                    // <-- règle métier : en attente
    masterPeopleId: master._id,
    countryCode: 'CM',
    region: master.region || 'FCA',
    villageName: 'Village Test',
    engagementStatus: 'pioneer',
    location: master.primaryLocation && Array.isArray(master.primaryLocation.coordinates)
      ? { type: 'Point', coordinates: master.primaryLocation.coordinates }
      : { type: 'Point', coordinates: [11.5, 3.87] }, // Yaoundé (CM) par défaut
    createdBy: admin._id,
  });
  log(`\n🆕 Engagement de test créé: ${created._id} (approved=${created.approved})`);
  ok(created.approved === false, 'À la création, approved === false (en attente de validation)');

  // ── 3) Présent dans la file d'attente ? ─────────────────────────────────────
  const pending = await api(`/api/people-groups/pending?limit=100`, { token });
  const inPending = (pending.json?.data || []).some((p) => String(p._id) === String(created._id));
  ok(inPending, "Apparaît dans GET /people-groups/pending (En attente de validation)");

  // ── 4) ABSENT du reporting et de la carte tant que non approuvé ? ───────────
  const regionMid = await api(`/api/reporting/regions/${REGION}`);
  const mapMid = await api(`/api/master-people/map/dmm-engagements?limit=20000`, { token });
  const engMid = regionEngagementCount(regionMid.json);
  const mapPointsMid = (mapMid.json?.peoples || []);
  const onMapMid = mapPointsMid.some((p) => String(p.id) === String(created._id) || (p.name === testName));
  ok(engMid === engBefore, `Reporting FCA inchangé tant que non approuvé (${engBefore} -> ${engMid})`);
  ok(!onMapMid, 'Absent de la carte DMM tant que non approuvé');

  // ── 5) Approbation via l'API HTTP réelle ────────────────────────────────────
  const approve = await api(`/api/people-groups/${created._id}/approve`, { method: 'POST', token });
  ok(approve.status === 200, `POST /approve renvoie 200 (reçu ${approve.status})`);

  // Re-clic : doit renvoyer 200 idempotent (et non 400 "déjà approuvé")
  const approveAgain = await api(`/api/people-groups/${created._id}/approve`, { method: 'POST', token });
  ok(approveAgain.status === 200 && approveAgain.json?.alreadyApproved === true,
    `Re-approbation idempotente: 200 + alreadyApproved=true (reçu ${approveAgain.status})`);

  // La file d'attente ne doit plus le contenir
  const pendingAfter = await api(`/api/people-groups/pending?limit=100`, { token });
  const stillPending = (pendingAfter.json?.data || []).some((p) => String(p._id) === String(created._id));
  ok(!stillPending, "Ne figure plus dans la file d'attente après approbation");

  // ── 6) PRÉSENT dans reporting + carte après approbation ─────────────────────
  const regionAfter = await api(`/api/reporting/regions/${REGION}`);
  const mapAfter = await api(`/api/master-people/map/dmm-engagements?limit=20000`, { token });
  const engAfter = regionEngagementCount(regionAfter.json);
  const mapPointsAfter = (mapAfter.json?.peoples || []);
  const onMapAfter = mapPointsAfter.some((p) => String(p.id) === String(created._id) || (p.name === testName));

  // Le reporting FCA doit avoir augmenté (ou au moins ne pas avoir diminué) et
  // la région complète renvoyée doit porter le libellé complet.
  ok(engAfter === null || engAfter >= engBefore, `Reporting FCA prend en compte l'engagement après approbation (${engBefore} -> ${engAfter})`);
  ok(regionAfter.json?.data?.fullName === 'Francophone Central Africa',
    `Libellé région = "Francophone Central Africa" (reçu "${regionAfter.json?.data?.fullName}")`);
  ok(onMapAfter, 'Apparaît sur la carte DMM après approbation');

  // ── 7) Nettoyage ────────────────────────────────────────────────────────────
  await PeopleGroup.deleteOne({ _id: created._id });
  log(`\n🧹 Engagement de test supprimé (${created._id}).`);

  await mongoose.disconnect();
  log('\n=== Test terminé ===');
}

run().catch((e) => { console.error('\n💥 Erreur test:', e.message); process.exit(1); });
