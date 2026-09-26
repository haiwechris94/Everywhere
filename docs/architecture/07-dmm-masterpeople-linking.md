# DMM → MasterPeople Linking & FCA Reporting — Design

> **Status:** Proposal / design doc. Contains two decisions the user must confirm before implementation (see §10).
> **Scope:** Design only — no code changes are made by this document.
> **Language note:** Written primarily in clear English; key domain terms are noted in French where the app uses them (e.g. *par trimestres* = quarterly, *mouvement* = movement, *point de basculement* = tipping point).

---

## 1. Problem & Goal

DMM `PeopleGroup` records are **engagements**, not canonical peoples. They describe a field engagement of an organization with a people **localized in a specific village**, not the people itself.

Consequences of the current model:

- One real people (e.g. **Fulani**) appears as **multiple** `PeopleGroup` docs — for example *Fulani Maroua* and *Fulani Garoua* — localized in different villages.
- Different organizations may record the **same people under different names**.

Because of this, we cannot count peoples correctly, and we cannot show a single people moving from **unreached → reached** as engagements accumulate.

**Goal:**

1. Aggregate engagements up to a **canonical people** (`MasterPeople`) so counts are correct and a people can visibly progress `unreached → pioneer → midway → tipping-point → dmm`.
2. Display JP / IMB / CPPI **reference peoples** alongside **NG-engaged** peoples per FCA zone/country.
3. NG reports are **quarterly** (*par trimestres*).

**DMM cycle (reference):** PRAY → ENGAGE → FIND → DISCOVER → ASSEMBLE → MULTIPLY.

---

## 2. Current State (as-is)

- The **MasterPeople canonical system** — models `MasterPeople`, `PeopleSource`, `PeopleLocation`, `PeopleStatus`, `PeopleAlias`, `PeopleMatch` — is populated **only from JP and CPPI** via `backend/scripts/buildMasterPeople.js`.
- There are **no `sourceType:'DMM'` `PeopleSource` records**.
- `PeopleGroup` has **no `masterPeopleId` field**.
- **IMB and FTT are also NOT ingested** into MasterPeople — they write only to `PeopleGroup`.
- `backend/routes/reporting.js` already defines the NG zones and produces **quarterly numerical rollups by country/zone, not by people**:
  - `FCA = ['CM','TD','CG','CD','GA','CF','GQ','UG']`
  - `AWA = ['SL','GH','LR','GM','NG','GW','GN']`
  - `FWA = ['CI','BJ','TG','NE','ML','BF','SN','GN']`
  - Existing endpoints: `GET /numerical`, `GET /quarterly`. Helpers: `resolveCountryCodes`, `resolveEntityIdsByCountry`, `buildNumericalReport`.

---

## 3. Target State (to-be)

- Every DMM `PeopleGroup` (`source:'DMM'`) becomes a `PeopleSource` with `sourceType:'DMM'` **linked to a `MasterPeople`**.
- Add an **optional `masterPeopleId` ref** on `PeopleGroup` for fast rollups.
- `MasterPeople.sourceTypes` includes `'DMM'`.
- **FCA reporting groups by `MasterPeople`**, aggregating all of that people's DMM engagements.

---

## 4. Schema Changes

### 4.1 `PeopleGroup.js` (`backend/models/PeopleGroup.js`)

Add:

```js
masterPeopleId: { type: ObjectId, ref: 'MasterPeople', index: true, sparse: true }
```

Optionally add `engagementKey` (**org + locality**) to support dedupe of engagements within a single people.

Existing relevant `PeopleGroup` fields (unchanged): `name`, `villageName`, `location` (GeoJSON `Point`), `region`, `country`, `countryCode`, `admin2`, `admin3`, `numberOfChurches`, `churchGeneration`, `engagementStatus` (enum `[unreached, pioneer, midway, tipping-point, dmm]`), `engagementLevel` (enum `[I, II, III, IV]`), `source` (enum `[DMM, manual, Survey, Joshua Project, IMB, PeopleGroups.org, Finishing the Task]`).

### 4.2 `PeopleSource` — `sourceType:'DMM'`

- `sourceRecordId` = `PeopleGroup._id` (as string).
- Store in `rawAttributes` (Mixed): `name`, `villageName`, `country`/`countryCode`, `location`.
- `peopleId3` / `pgid` / `rop3` are usually **null** for DMM records.
- Respect existing **unique index `sourceType + sourceRecordId`** (this is what makes ingestion idempotent).

### 4.3 `PeopleMatch`

Reuse the existing `PeopleMatch` audit model **unchanged**: `masterPeopleId`, `fromSourceId`/`toSourceId`, `matchType` (enum `[CROSS_REFERENCE, EXACT_ID, COUNTRY, NAME_SIMILARITY, GEO_PROXIMITY, MANUAL]`), `matchTier` (1–5), `confidence` (0–100), `confidenceBand` (enum `[AUTO_MERGE, MANUAL_REVIEW, KEEP_SEPARATE]`), `decidedBy` (default `system`).

---

## 5. Matching Approach for DMM (adapting the existing 5-tier matcher)

### 5.1 Refactor first — the matcher is currently un-exportable

In `backend/scripts/buildMasterPeople.js`, `scorePair()` and its helpers are **module-private with NO exports**:

`scorePair`, `trigramSimilarity`, `trigrams`, `normName`, `haversineKm`, `jpCountryToIso3`, `cppiCountryToIso3`, `tierName`, `bandFor`, `UnionFind`, plus `jpBestName`, `cppiBestName`, `jpGeo`, `cppiGeo`, `deriveStatus`.

They must be **refactored into a shared module** — `backend/scripts/lib/peopleMatcher.js` (or `backend/services/peopleMatcher.js`) — and imported by **both** `buildMasterPeople.js` and the new DMM ingestion script. This is **Phase 1** and must be behavior-preserving for `buildMasterPeople.js`.

### 5.2 The existing 5-tier model (for reference)

| Tier | Name | Meaning |
|------|------|---------|
| 1 | `CROSS_REFERENCE` | confidence 100, union-find |
| 2 | `EXACT_ID` | ROP3 exact id |
| 3 | `COUNTRY` | iso3 country match |
| 4 | `NAME_SIMILARITY` | trigram Jaccard, signal only |
| 5 | `GEO_PROXIMITY` | haversine ≤ 25 km, R = 6371 |

- `matchTier` = **minimum** matched tier; `confidence` = `clamp(Σ point contributions, 0, 100)`.
- Bands: `AUTO_MERGE ≥ 90` / `MANUAL_REVIEW ≥ 70` / `KEEP_SEPARATE` otherwise.
- `normName`: NFKD normalize, strip diacritics, lowercase, collapse non-alphanumerics to a single space, trim.

**Existing (JP/CPPI) constants:** `AUTO_MERGE=90`, `MANUAL_LOW=70`, `PROX_RADIUS_KM=25`, `PTS_ROP3_MATCH=55`, `PTS_ROP3_CONFLICT=-40`, `PTS_COUNTRY_MATCH=20`, `PTS_COUNTRY_MISMATCH=-15`, `PTS_NAME_HIGH=15`, `PTS_NAME_MED=8`, `PTS_GEO=10`. Name-sim thresholds: high `0.85`, med `0.60`.

### 5.3 Why the existing weights fail for DMM

DMM records **lack ROP3 / PEID / PeopleID3** → Tier 1 (`CROSS_REFERENCE`) and Tier 2 (`EXACT_ID` / ROP3) **rarely fire**.

Matching therefore leans on:

- **Tier 3 COUNTRY** (iso3): `+20` match / `-15` mismatch.
- **Tier 4 NAME_SIMILARITY** (trigram Jaccard): `sim ≥ 0.85 → +15`; `0.60 ≤ sim < 0.85 → +8`.
- **Tier 5 GEO_PROXIMITY** (haversine ≤ 25 km): `+10`.

**Consequence with existing weights:** a DMM group matched to a JP/CPPI `MasterPeople` by *same country + high name sim + geo* scores:

```
COUNTRY 20 + NAME_HIGH 15 + GEO 10 = 45  →  below MANUAL_LOW (70)  →  KEEP_SEPARATE
```

Pure name + geo + country **tops out at 45**. **Because DMM lacks the ROP3 `+55`, confidence will almost always be LOW** and nothing links. This is the core problem to solve.

### 5.4 Proposed DMM-tuned scoring profile *(DECISION — user must validate)*

Since ROP3 is unavailable, introduce a **DMM-specific scoring profile** that re-weights the surviving signals so that COUNTRY + high-name-sim + geo can reach the `MANUAL_REVIEW` band. Proposed DMM weights:

| Signal | DMM weight |
|--------|-----------|
| NAME exact / normalized-equal | strong (drives toward `AUTO_MERGE`) |
| NAME `sim ≥ 0.85` | **+45** |
| NAME `0.60 ≤ sim < 0.85` | **+25** |
| COUNTRY match | **+20** |
| GEO ≤ 25 km | **+10** |
| **COUNTRY mismatch** | **hard gate → KEEP_SEPARATE** |

Same-country is a **hard gate**: a mismatched country forces `KEEP_SEPARATE` regardless of other signals.

**Worked example:** `Fulani` (DMM, country `CM`, name `'Fulani'`) vs `MasterPeople` `Fulani` (country `CM`):

```
NAME_HIGH 45 + COUNTRY 20 + GEO 10 = 75  →  MANUAL_REVIEW
```

Exact **normalized name equality** can push into the `AUTO_MERGE` band.

> Keep the band cut-offs unchanged (`AUTO_MERGE ≥ 90`, `MANUAL_REVIEW ≥ 70`). Only the **point weights** differ under the DMM profile. **This is a proposal — the user should validate the weights before coding.**

### 5.5 The `Fulani Maroua` / `Fulani Garoua` case — name normalization

`normName` today does **not** strip locality tokens — it keeps `'fulani maroua'` and `'fulani garoua'` as distinct strings, so they will **not** match each other or a canonical `Fulani`.

**Proposal:** add a **DMM name-normalization step** that also strips known locality/admin tokens (values of `region`, `admin2`, `admin3`, `villageName`) from the engagement name **before** similarity is computed. Then:

```
'Fulani Maroua'  → 'fulani'
'Fulani Garoua'  → 'fulani'
```

Both reduce to `fulani` and match the same `MasterPeople`. **This is the key mechanism for aggregating engagements of the same people.**

### 5.6 Aggregating engagements

Two DMM engagements of the same people (same or different orgs, different names) **both link to the same `MasterPeople`**. Each link is recorded in the `PeopleMatch` audit with `matchTier` / `confidence` / `confidenceBand`. `MANUAL_REVIEW`-band matches (`decidedBy:'pending'`) surface in an **admin review queue**.

---

## 6. People-level Status Rollup Rules

A `MasterPeople`'s **DMM rollup** aggregates across **ALL** linked DMM `PeopleSource`/`PeopleGroup` records:

- `engagementCount`
- `villagesTouched` — distinct `villageName`
- `totalChurches` — Σ `numberOfChurches`
- `maxChurchGeneration` — max `churchGeneration`
- Field entities joined via `PeopleGroup`: DBS `decisionsForChrist`, `baptisms`, `discoveryGroups`, `personsOfPeace`
  (from `DBSSession` → `decisionsForChrist`, `baptisms`, `discoveryGroup` ref; `DiscoveryGroup` → `status`, `peopleGroup` ref; `PersonOfPeace` → `status`, `peopleGroup` ref).

### Global `engagementStatus` for the people — two options

**Option A — most-advanced engagement:** take the status of the single most-advanced engagement.

**Option B *(RECOMMENDED)* — aggregate then recompute:** sum churches and take the max generation across engagements, then run the result through `dmmStatusCalculator` (`backend/services/dmmStatusCalculator.js`):

- `CHURCH_THRESHOLDS`: `MOUVEMENT=100`, `POINT_DE_BASCULEMENT=67`, `MI_PARCOURS=34`, `PIONNIER=1`
- `GENERATION_THRESHOLDS`: `IV=7`, `III=5`, `II=3`, `I=1`

This produces an **aggregate** status so a people visibly moves `unreached → pioneer → midway → tipping-point → dmm` (*pionnier → mi-parcours → point de basculement → mouvement*).

**Tradeoff:** Option A is simpler and never overstates any single site, but it hides accumulated impact — a people with many small engagements never advances. Option B reflects the true combined footprint of the people, but summing across engagements risks **double-counting** churches recorded by different orgs in overlapping areas; it depends on clean dedupe (see `engagementKey`, §4.1).

---

## 7. FCA Reporting Endpoint Contract

Propose `GET /api/reporting/peoples` (add to `backend/routes/reporting.js`). Reuse the existing `NG_AREAS` map and `resolveCountryCodes`.

### Request query params

| Param | Meaning |
|-------|---------|
| `areas` | comma list, e.g. `FCA` |
| `countries` | comma ISO2 list |
| `from`, `to` | date window **OR**… |
| `year` + `quarter` | quarterly window (*par trimestres*) |
| `sourceTypes` | filter, e.g. `DMM,JP,CPPI` |
| `status` | status filter |
| `page`, `limit` | pagination |

### Response shape (JSON)

```json
{
  "meta": { "areas": [], "countries": [], "window": {}, "totals": {} },
  "data": [
    {
      "masterPeopleId": "...",
      "canonicalName": "...",
      "rop3": "...",
      "primaryCountryCode": "...",
      "sourceTypes": ["DMM", "JP"],
      "isNGEngaged": true,
      "status": { "global": "...", "jpScale": "...", "leastReached": true },
      "dmm": {
        "engagementCount": 0,
        "villagesTouched": 0,
        "totalChurches": 0,
        "maxGeneration": "...",
        "disciples": 0,
        "baptisms": 0,
        "quarterly": [
          { "year": 2025, "quarter": 1, "newDisciples": 0, "baptisms": 0 }
        ]
      },
      "reference": { "jp": {}, "cppi": {} },
      "engagements": [
        {
          "peopleGroupId": "...",
          "name": "Fulani Maroua",
          "villageName": "...",
          "region": "...",
          "admin2": "...",
          "admin3": "...",
          "engagementStatus": "...",
          "numberOfChurches": 0,
          "churchGeneration": "..."
        }
      ]
    }
  ]
}
```

### Badging

- `isNGEngaged` = `sourceTypes` includes `'DMM'`.
- JP / CPPI-only peoples appear as **reference rows** with an **empty `dmm` block**.

---

## 8. Frontend Display (brief)

A zone/country selector drives the list. **NG-engaged** peoples show rich DMM field data + a **quarterly trend**; **JP / IMB / CPPI-only** peoples show as **lighter reference rows**. Expanding a people reveals its underlying engagements (e.g. `Fulani → Fulani Maroua, Fulani Garoua`). Full frontend design is a later task.

---

## 9. Rollout Plan & Idempotency

- **Phase 1 — Refactor matcher** into the shared module (`backend/scripts/lib/peopleMatcher.js`), **no behavior change** to `buildMasterPeople.js`.
- **Phase 2 — Schema + ingestion.** Add `masterPeopleId` to `PeopleGroup` + build a DMM ingestion script supporting `--dry-run`, `--reset`, `--limit` (like `buildMasterPeople.js`). Use an **idempotent upsert keyed by `(sourceType:'DMM', sourceRecordId:PeopleGroup._id)`** (backed by the existing unique index).
- **Phase 3 — Reporting endpoint** (`GET /api/reporting/peoples`).
- **Phase 4 — Real-time linking hook** in `PeopleGroup` create/update.
- **Phase 5 — Frontend.**
- **Manual review queue** for `MANUAL_REVIEW`-band matches (`decidedBy:'pending'`).

---

## 10. Open Questions for Validation

Two decisions must be confirmed **before** coding the ingestion script:

1. **DMM scoring weights (§5.4):** approve the proposed DMM-tuned profile — `NAME sim ≥ 0.85 → +45`, `0.60 ≤ sim < 0.85 → +25`, `COUNTRY +20`, `GEO +10`, and **same-country as a hard gate** (mismatch → `KEEP_SEPARATE`), with band cut-offs unchanged (`AUTO_MERGE ≥ 90`, `MANUAL_REVIEW ≥ 70`).
2. **Status rollup option (§6):** choose **Option A** (most-advanced engagement) or **Option B — recommended** (aggregate churches + max generation through `dmmStatusCalculator`).
