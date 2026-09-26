# Step 5 — Migration Workflows (Phases A–G)

This document defines the production-grade MongoDB migration workflows that
transform the raw source datasets (CPPI, Joshua Project, and the authoritative
cross-reference) into the canonical people-graph collections defined in Step 4.
It builds directly on the schema from **Step 4** and the merge model from
**Step 3**.

## Target canonical collections (from Step 4)

| Collection         | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `master_people`    | One canonical document per resolved ethnic/people group.          |
| `people_sources`   | One doc per contributing source record, referencing a master.     |
| `people_matches`   | Immutable audit of every merge / no-merge decision.               |
| `people_aliases`   | Every searchable name/id variant across sources.                  |
| `people_locations` | GeoJSON `Point` markers (2dsphere) per source coordinate set.      |
| `people_statuses`  | Engagement / DMM status records rolled up per master.             |

## Merge model (from Step 3)

The migration reuses the **5-tier match model** and its **confidence bands**:

| Band            | Confidence | Decision           | Behavior                        |
| --------------- | ---------- | ------------------ | ------------------------------- |
| Auto-merge      | 90–100     | `AUTO_MERGE`       | Records collapse into 1 master. |
| Manual review   | 70–89      | `MANUAL_REVIEW`    | Kept separate, queued for human.|
| Keep separate   | 0–69       | `KEEP_SEPARATE`    | Distinct masters, no merge.     |

Tiers (highest priority first):

1. **Tier 1 — Official cross-reference** (`+100`, `AUTO_MERGE`): authoritative
   `PEID ↔ PeopleID3` links from `jp-cppi-cross-reference.xlsx`.
2. **Tier 2 — Exact ROP3 + country match** (high confidence).
3. **Tier 3 — Exact ROP3 (any country)** (medium-high).
4. **Tier 4 — Normalized name + country + geo proximity** (medium).
5. **Tier 5 — Fuzzy name / weak signals** (low; usually `KEEP_SEPARATE`).

## Source files (real, on disk)

| Alias | Path                                             | Format / notes                                                                                    |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| CPPI  | `backend/data/people_groups.csv`                 | `;`-delimited, **header on line 1**, keyed on `PEID`/`PGID`, **12,376 rows**, ~24.9% missing ROP3/geo (~3,086 missing ROP3). |
| JP    | `backend/data/AllPeoplesInCountry.csv`           | `;`-delimited, **2-line preamble → header on line 3**, keyed on `PeopleID3`, **16,449 rows**, 10,432 `PeopleID3`, **10,424 distinct ROP3**, 13 missing geo. |
| XREF  | `backend/data/jp-cppi-cross-reference.xlsx`      | **19,375 authoritative `PEID ↔ PeopleID3` links** (Tier-1).                                       |

JP data may also be pulled live via `backend/services/joshuaProjectService.js`.

### Overlap projections (used for reconciliation)

- **Shared ROP3:** 5,317
- **JP-only:** 5,107
- **CPPI-only:** 964

## Staging pattern

All raw ingestion writes to **temporary staging collections** before any
canonical collection is touched:

- `staging_cppi` — normalized CPPI rows.
- `staging_jp` — normalized JP rows.
- `staging_xref` — normalized cross-reference links.

Staging collections carry the current `migrationRunId` and are **dropped on
successful completion or on failure** (see Rollback). Canonical writes only
occur in Phases D–G, after staging is validated.

---

## PHASE A — Import CPPI CSV

**Goal:** Load `people_groups.csv` into `staging_cppi`, preserving raw data and
resolving intra-file duplicates.

**Inputs:** `backend/data/people_groups.csv` (`;`-delimited, header line 1).

**Steps:**

1. Stream-parse the CSV with `;` delimiter; treat **line 1 as the header**.
2. For each row, trim/normalize keys; compute `ROP3`, `countryCode`, geo, name
   fields; retain the **entire original row** into `rawAttributes`.
3. Upsert into `staging_cppi` **keyed on `PEID`** (`PGID` retained as secondary
   key). Attach `migrationRunId`.
4. De-duplicate on `(countryCode, ROP3)`: keep the **most complete row**
   (fewest null/blank required fields; tie-break on longest `rawAttributes`).
5. Record each dropped duplicate as an **alias candidate** (stored on the
   surviving staged doc under `aliasCandidates[]`) for later Phase F.
6. Flag rows **missing `ROP3` or geo** (`flags.missingRop3`, `flags.missingGeo`).

**Output collections written:** `staging_cppi` (temporary).

**Idempotency / re-run:** Upsert on `PEID` → re-running overwrites the same
staged docs deterministically; duplicate resolution is a pure function of file
contents, so results are stable.

**Validation checks:**

- `staged_count == file_rows − dropped_dupes`.
- Report `missingRop3` count (expected **~3,086**).
- No `staging_cppi` doc without a `PEID`.

---

## PHASE B — Synchronize Joshua Project

**Goal:** Load JP data into `staging_jp` keyed on `PeopleID3`.

**Inputs:** Live pull via `backend/services/joshuaProjectService.js` **or**
`backend/data/AllPeoplesInCountry.csv`.

**Steps:**

1. Fetch JP records via `joshuaProjectService`. If importing from the CSV
   instead, **skip the 2-line preamble — the header is on line 3** — and parse
   with `;` delimiter.
2. Normalize and capture: `PeopleID3`, `ROP3`, `ROG3`/country, name fields
   (`PeopNameAcrossCountries`, `PeopNameInCountry`), geo (lat/lng), `JPScale`.
3. Upsert into `staging_jp` **keyed on `PeopleID3`**. Attach `migrationRunId`.
4. Preserve full raw payload into `rawAttributes`.
5. Flag rows missing geo (`flags.missingGeo`).

**Output collections written:** `staging_jp` (temporary).

**Idempotency / re-run:** Upsert on `PeopleID3` → re-runs are stable; live pull
is snapshot-tagged by `migrationRunId`.

**Validation checks:**

- **10,432 `PeopleID3`** staged; **10,424 distinct ROP3**.
- Missing-geo count ≈ 13.

---

## PHASE C — Apply official cross-reference

**Goal:** Link CPPI and JP staged records via the authoritative xref (Tier-1).

**Inputs:** `backend/data/jp-cppi-cross-reference.xlsx`, `staging_cppi`,
`staging_jp`.

**Steps:**

1. Parse `jp-cppi-cross-reference.xlsx` into `staging_xref` (one doc per
   `PEID ↔ PeopleID3` link; **19,375 links**). Attach `migrationRunId`.
2. For each xref row, resolve `staging_cppi.PEID` ↔ `staging_jp.PeopleID3`.
   Mark each side as `xrefLinked = true`.
3. Emit a Tier-1 decision (`+100`, `AUTO_MERGE`, `crossReferenceType: OFFICIAL`)
   into an in-memory decision buffer (persisted in Phase E).
4. Build a **union-find / disjoint-set grouping** where each source record
   (CPPI or JP) is a node and every xref link unions two nodes. Connected
   components become resolved ethnic-group clusters.

**Output collections written:** `staging_xref` (temporary); union-find groups
held in memory / a scratch `staging_groups` collection.

**Idempotency / re-run:** Xref parse upserts on `(PEID, PeopleID3)`; union-find
is deterministic given the same staged inputs.

**Validation checks:**

- All 19,375 xref links resolve to at least one staged side; log unresolved
  links (missing PEID or PeopleID3).
- No group contains contradictory country/ROP3 without a flag.

---

## PHASE D — Generate master people

**Goal:** Produce one `master_people` document per resolved group, plus
standalones for unmatched sources.

**Inputs:** Union-find groups from Phase C, `staging_cppi`, `staging_jp`.

**Steps:**

1. For each resolved group, create **one `master_people` doc** with a new
   `ObjectId`.
2. Pick `canonicalName` by priority:
   **JP `PeopNameAcrossCountries` → CPPI `NmDisp` → JP `PeopNameInCountry` →
   CPPI `Name`**.
3. Set `rop3`, `rop2`, `rop1`, `primaryCountryCode`, `totalPopulation`
   (aggregate/best-available), and denormalized `sourceTypes[]`
   (e.g. `["JP","CPPI"]`).
4. **Unmatched JP-only (5,107)** → each becomes a standalone `master_people`.
5. **Unmatched CPPI-only (964)** → each becomes a standalone `master_people`.
6. For pairs **not covered by xref**, run **Tiers 2–5** scoring with blocking on
   `ROP3` / country / geo proximity:
   - `≥ 90` → `AUTO_MERGE` (fold into an existing/new master).
   - `70–89` → `MANUAL_REVIEW` (keep separate, enqueue).
   - `< 70` → `KEEP_SEPARATE` (standalone master).
7. Stamp every written master with `migrationRunId` and `version`.

**Output collections written:** `master_people`.

**Idempotency / re-run:** Masters are keyed by a **deterministic natural key**
(sorted set of member `PEID`/`PeopleID3` → stable group key). Re-runs
lookup-by-natural-key and upsert rather than minting duplicate ObjectIds.

**Validation checks:**

- `masters_created == groups + jpOnly + cppiOnly + tier2-5_keep_separate`.
- Every master has a non-empty `canonicalName` and at least one `sourceType`.
- No master references a source record assigned to another master.

---

## PHASE E — Generate source mappings

**Goal:** Persist per-source lineage and the full decision audit trail.

**Inputs:** `master_people`, `staging_cppi`, `staging_jp`, decision buffer.

**Steps:**

1. Write one `people_sources` doc **per contributing source record** with
   `masterPeopleId` ref, `sourceType`, natural key (`PEID` or `PeopleID3`), and
   full `rawAttributes`.
2. Write one `people_matches` **audit doc for every merge / no-merge decision**
   with: `matchType`, `matchTier`, `confidence`, `confidenceBand`,
   `crossReferenceType`, `decidedBy` (`system` for Tier-1/auto, `pending` for
   manual review).
3. Stamp all docs with `migrationRunId`.

**Output collections written:** `people_sources`, `people_matches`.

**Idempotency / re-run:** `people_sources` upsert on `(sourceType, naturalKey)`;
`people_matches` upsert on decision hash `(leftKey, rightKey, matchTier)`.

**Validation checks:**

- Every staged source record has exactly one `people_sources` doc.
- Every `AUTO_MERGE`/`MANUAL_REVIEW`/`KEEP_SEPARATE` decision has a match doc.
- `people_sources.masterPeopleId` always resolves to an existing master.

---

## PHASE F — Generate aliases

**Goal:** Build a searchable alias index across all sources.

**Inputs:** `staging_cppi`, `staging_jp`, `master_people`, alias candidates
from Phase A.

**Steps:**

1. For each source record and each master, emit `people_aliases` docs from every
   variant: `NAME_ACROSS`, `NAME_IN_COUNTRY`, `DISPLAY`, `ALTERNATE`, `ROP3`,
   `PGID`, `PEID`.
2. Include the Phase-A `aliasCandidates[]` (dropped duplicate rows).
3. De-duplicate on `(masterPeopleId, aliasType, normalizedValue)`.

**Output collections written:** `people_aliases`.

**Idempotency / re-run:** Upsert on `(masterPeopleId, aliasType,
normalizedValue)` → repeated runs never duplicate aliases.

**Validation checks:**

- Every master has ≥ 1 alias (its canonical name).
- No alias without a resolvable `masterPeopleId`.

---

## PHASE G — Generate geographic markers

**Goal:** Persist geo markers and denormalize primary geo + status onto masters.

**Inputs:** `staging_cppi`, `staging_jp`, `master_people`, `people_statuses`.

**Steps:**

1. For each source's coordinates, write a `people_locations` doc with GeoJSON
   `Point` `[lng, lat]` and ensure a **2dsphere** index.
2. Choose **exactly one `isPrimary = true`** location per master, **preferring
   JP geo** (JP has only ~13 missing vs CPPI ~3,088 missing).
3. Denormalize the primary point onto `master_people.primaryLocation`.
4. Roll up `people_statuses` and denormalize the summary onto
   `master_people.status`.

**Output collections written:** `people_locations` (and denormalized fields on
`master_people`).

**Idempotency / re-run:** Upsert on `(masterPeopleId, sourceType, naturalKey)`;
primary selection is deterministic (JP-first, then completeness).

**Validation checks:**

- Exactly one `isPrimary = true` per master that has any location.
- Every `people_locations.geometry` is a valid GeoJSON `Point`.
- Masters with no source geo have `primaryLocation = null` (logged).

---

## Ordering & dependencies

```
A ─┐
   ├─► C ─► D ─► E
B ─┘             ├─► F
                 └─► G
```

- **A and B** run first (independent, may run in parallel) — they populate
  `staging_cppi` and `staging_jp`.
- **C** requires A and B (needs both staged sides to link).
- **D** requires C (needs the resolved groups).
- **E, F, G** all require D (need `master_people` to exist).

## Idempotency & re-runs

- Every ingest is an **upsert keyed on a natural ID** (`PEID`, `PeopleID3`,
  `(PEID, PeopleID3)`).
- Masters use a **deterministic group key → lookup-by-natural-key** strategy so
  re-runs never mint duplicate `ObjectId`s.
- Duplicate resolution, union-find grouping, canonical-name selection, and
  primary-geo selection are **pure functions of the inputs**, so the pipeline is
  **safe to re-run** end-to-end and converges to the same state.
- Each write is stamped with `migrationRunId` + `version` for traceability.

## Reconciliation report

At the end of a run the loader must **emit measured final counts** and
reconcile them against the Step-3/Step-4 projections:

| Metric                        | Source of truth                                              | Projection                      |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------- |
| Auto-merged                   | dominated by **19,375 xref** links + **5,317 shared ROP3**   | high                            |
| Manual review queued (70–89)  | Tier 2–5 ambiguous pairs                                     | **~3,000+**                     |
| JP-only standalone            | unmatched JP                                                | **5,107**                       |
| CPPI-only standalone          | unmatched CPPI                                              | **up to 964**                   |
| Masters created               | groups + standalones + keep-separate                        | measured, must reconcile        |

The report must print **measured** values (masters created, auto-merged,
manual-review queued, kept-separate) alongside these projections and **flag any
delta beyond tolerance** as a validation failure.

## Rollback

- On **failure**, all `staging_*` collections are **dropped** — no partial
  staging leaks into canonical data.
- Canonical writes (Phases D–G) are wrapped so a failed run **leaves prior
  state intact**: every written doc carries a `migrationRunId` / `version` tag,
  so a failed run's docs can be identified and removed (or a prior version
  promoted) without touching unrelated data.
- Prefer running canonical writes inside a **session/transaction** where the
  deployment supports it; otherwise use the `migrationRunId` tag as the
  compensating-delete key.

## Representative pseudocode

### Phase C + D — xref linking + master creation

```js
// Phase C: union-find over xref links, then Phase D: create masters.
const { UnionFind } = require('./util/unionFind');

async function linkAndBuildMasters(runId) {
  const uf = new UnionFind();

  // Tier-1: union CPPI PEID nodes with JP PeopleID3 nodes via official xref.
  const xrefCursor = StagingXref.find({ migrationRunId: runId }).cursor();
  for await (const x of xrefCursor) {
    const cppiNode = `CPPI:${x.PEID}`;
    const jpNode = `JP:${x.PeopleID3}`;
    uf.add(cppiNode);
    uf.add(jpNode);
    uf.union(cppiNode, jpNode); // +100, AUTO_MERGE, OFFICIAL
  }

  // Resolve connected components → one master per group.
  const groups = uf.groups(); // Map<rootKey, string[]>
  const ops = [];

  for (const [rootKey, members] of groups) {
    const cppi = await StagingCppi.find({
      PEID: { $in: members.filter(m => m.startsWith('CPPI:')).map(m => m.slice(5)) },
    }).lean();
    const jp = await StagingJp.find({
      PeopleID3: { $in: members.filter(m => m.startsWith('JP:')).map(m => m.slice(3)) },
    }).lean();

    const canonicalName =
      jp[0]?.PeopNameAcrossCountries ||
      cppi[0]?.NmDisp ||
      jp[0]?.PeopNameInCountry ||
      cppi[0]?.Name;

    const groupNaturalKey = members.slice().sort().join('|'); // deterministic

    ops.push({
      updateOne: {
        filter: { groupNaturalKey },            // lookup-by-natural-key
        update: {
          $setOnInsert: { _id: new mongoose.Types.ObjectId() },
          $set: {
            groupNaturalKey,
            canonicalName,
            rop3: jp[0]?.ROP3 || cppi[0]?.ROP3,
            rop2: jp[0]?.ROP2 || cppi[0]?.ROP2,
            rop1: jp[0]?.ROP1 || cppi[0]?.ROP1,
            primaryCountryCode: jp[0]?.ROG3 || cppi[0]?.countryCode,
            totalPopulation: bestPopulation(jp, cppi),
            sourceTypes: [...new Set([...jp.map(() => 'JP'), ...cppi.map(() => 'CPPI')])],
            migrationRunId: runId,
            version: MIGRATION_VERSION,
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) await MasterPeople.bulkWrite(ops, { ordered: false });
}
```

### bulkWrite example — Phase E source mappings

```js
// Phase E: persist people_sources for every CPPI staged record.
async function writeCppiSources(runId) {
  const ops = [];
  const cursor = StagingCppi.find({ migrationRunId: runId }).cursor();

  for await (const row of cursor) {
    const master = await MasterPeople.findOne(
      { groupNaturalKey: { $regex: `(^|\\|)CPPI:${row.PEID}(\\||$)` } },
      { _id: 1 },
    ).lean();

    ops.push({
      updateOne: {
        filter: { sourceType: 'CPPI', naturalKey: row.PEID },
        update: {
          $set: {
            sourceType: 'CPPI',
            naturalKey: row.PEID,
            masterPeopleId: master?._id ?? null,
            rawAttributes: row.rawAttributes,
            migrationRunId: runId,
          },
        },
        upsert: true,
      },
    });

    if (ops.length === 1000) {
      await PeopleSources.bulkWrite(ops.splice(0), { ordered: false });
    }
  }

  if (ops.length) await PeopleSources.bulkWrite(ops, { ordered: false });
}
```
