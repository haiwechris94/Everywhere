# Step 4 — MongoDB Document Schemas, Indexes & Denormalization

> **MongoDB-first.** This step specifies the production document schemas for the canonical **Master People** model as **MongoDB collections** (Mongoose). All references use **ObjectId**, geospatial data uses **GeoJSON `Point`** with a **`2dsphere`** index, and there is **no PostgreSQL / PostGIS**. Spatial matching uses MongoDB `$near` / `$geoWithin` (replacing PostGIS `ST_DWithin`), and name similarity is computed **application-side** (e.g. Dice/Jaro) — name remains a **signal only** (replacing `pg_trgm`).

## Collections at a glance

| Collection | Cardinality | Role |
| --- | --- | --- |
| `master_people` | one per ethnic group | **Read-optimized.** Canonical entity + denormalized summary that powers the map. |
| `people_sources` | many per master people | **Write-heavy, lossless.** One document per original source record (JP, CPPI, …) with the full raw row. |
| `people_matches` | many per master people | Audit of every match/merge decision (5-tier algorithm, confidence bands). |
| `people_aliases` | many per master people | Alternate names across/within sources (name is a *signal only*). |
| `people_locations` | many per master people | GeoJSON `Point` coordinates with a `2dsphere` index. |
| `people_statuses` | one per master people | Reached/engagement status (unique on `masterPeopleId`). |

### Reference graph

```
master_people._id
   ▲   ▲   ▲   ▲   ▲
   │   │   │   │   │
people_sources.masterPeopleId   (sourceRecordId unique per sourceType)
people_matches.masterPeopleId   (+ fromSourceId / toSourceId → people_sources._id)
people_aliases.masterPeopleId   (+ sourceId → people_sources._id)
people_locations.masterPeopleId (+ sourceId → people_sources._id)
people_statuses.masterPeopleId  (unique — one per master people)
```

### Grounding facts used in this design

- **JP** — `backend/data/AllPeoplesInCountry.csv`, keyed on `PeopleID3`; **16,449 rows**, **10,424 distinct ROP3**.
- **CPPI** — `backend/data/people_groups.csv`, keyed on `PEID` / `PGID`; **12,376 rows**, **~24.9% missing ROP3/geo**.
- **Cross-reference** — `backend/data/jp-cppi-cross-reference.xlsx`; **19,375 authoritative `PEID`↔`PeopleID3` links**.
- Existing model `backend/models/PeopleGroup.js`: GeoJSON `Point` `location` `[lng, lat]` with a `2dsphere` index, a `source` enum `['DMM','manual','Survey','Joshua Project','IMB','PeopleGroups.org','Finishing the Task']`, a `jpData` subdocument, and a `sourceData` **Mixed** field — the patterns below mirror this.

---

## 1. `master_people`

**Purpose.** One document per ethnic group — the canonical entity that the entire system resolves to. It carries the canonical identifiers plus a small, **denormalized summary** (`sourceTypes`, `primaryLocation`, `status`) copied from the child collections so that the map can render **one marker per group from a single collection scan** without any joins.

```js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const PointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const MasterStatusSummarySchema = new Schema(
  {
    status: {
      type: String,
      enum: ['UNREACHED', 'FRONTIER', 'MINIMALLY_REACHED', 'REACHED', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    jpScale: { type: Number, default: null },     // Joshua Project Progress Scale 1–5
    leastReached: { type: Boolean, default: null },
  },
  { _id: false }
);

const masterPeopleSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    canonicalName: { type: String, required: true, trim: true },

    // Registry of Peoples identifiers
    rop3: { type: String, default: null }, // people-group level (nullable; sparse-unique-ish)
    rop2: { type: String, default: null }, // people-cluster level
    rop1: { type: String, default: null }, // affinity-bloc level

    primaryCountryCode: { type: String, default: null }, // ISO3 (e.g. 'TCD')
    primaryLanguageName: { type: String, default: null },
    rol3: { type: String, default: null }, // ISO 639-3 language code

    affinityBloc: { type: String, default: null },
    peopleCluster: { type: String, default: null },

    totalPopulation: { type: Number, default: 0 },

    // --- Denormalized for the map (see "Denormalization" below) ---
    sourceTypes: { type: [String], default: [] },          // e.g. ['JP','CPPI']
    primaryLocation: { type: PointSchema, default: null },  // copied from people_locations.isPrimary
    status: { type: MasterStatusSummarySchema, default: () => ({}) }, // copied from people_statuses
  },
  { timestamps: true } // createdAt, updatedAt
);

// Indexes
masterPeopleSchema.index({ rop3: 1 }, { sparse: true });   // ROP3 lookups; sparse because ~24.9% of CPPI lacks ROP3
masterPeopleSchema.index({ primaryCountryCode: 1 });        // country filtering / facets
masterPeopleSchema.index({ sourceTypes: 1 });               // map source-visibility filtering (multikey)
masterPeopleSchema.index({ primaryLocation: '2dsphere' });  // map bounds / $near / $geoWithin
masterPeopleSchema.index({ canonicalName: 'text' });        // name search (signal only)

module.exports = mongoose.model('MasterPeople', masterPeopleSchema, 'master_people');
```

**References.** `master_people` is the parent; it holds **no** ObjectId references upward. Every child collection points back via `masterPeopleId → master_people._id`.

**Denormalization (the key performance optimization).** `sourceTypes`, `primaryLocation`, and `status` are **copied** onto `master_people` from `people_sources`, `people_locations`, and `people_statuses` respectively. This lets `GET /map/markers` return exactly **one marker per group** — with its coordinates, attached-source badges, and reached status — from a **single, lean, indexed scan of `master_people`**, with **no joins** to the child collections. The denormalized fields are refreshed by the migration/sync pipeline (Step 5/6) whenever sources, locations, or status change; the child collections remain the source of truth.

---

## 2. `people_sources`

**Purpose.** The **lossless, write-heavy** record store: one document per original source record contributing to a master people. Every raw column is preserved in `rawAttributes` (Mixed), mirroring the existing `PeopleGroup.sourceData` pattern, so no source data is ever discarded during merging.

```js
const peopleSourcesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },

    sourceType: {
      type: String,
      enum: ['JP', 'CPPI', 'DMM', 'FTT', 'SURVEY', 'MANUAL'],
      required: true,
    },
    sourceRecordId: { type: String, required: true }, // natural key within the source

    // Source identifiers (sparse — not every source provides every field)
    peopleId3: { type: String, default: null }, // JP PeopleID3
    peopleId2: { type: String, default: null }, // JP PeopleID2
    peopleId1: { type: String, default: null }, // JP PeopleID1
    peid: { type: String, default: null },       // CPPI PEID
    pgid: { type: String, default: null },       // CPPI PGID
    rop3: { type: String, default: null },
    rop2: { type: String, default: null },
    rop1: { type: String, default: null },

    countryCode: { type: String, default: null }, // ISO3
    countryName: { type: String, default: null },
    sourceName: { type: String, default: null },  // the group's name as given by this source
    population: { type: Number, default: null },

    // Full original row — mirrors PeopleGroup.sourceData (Mixed)
    rawAttributes: { type: Schema.Types.Mixed, default: {} },

    importedAt: { type: Date, default: Date.now },
    sourceUpdatedAt: { type: Date, default: null }, // last-updated timestamp from the source, if any
  },
  { timestamps: true }
);

// Indexes
peopleSourcesSchema.index({ masterPeopleId: 1 });                          // fetch all sources for a group
peopleSourcesSchema.index({ sourceType: 1, sourceRecordId: 1 }, { unique: true }); // idempotent imports
peopleSourcesSchema.index({ rop3: 1 });                                    // cross-reference by ROP3
peopleSourcesSchema.index({ peopleId3: 1 });                               // JP lookups
peopleSourcesSchema.index({ peid: 1 });                                    // CPPI lookups

module.exports = mongoose.model('PeopleSource', peopleSourcesSchema, 'people_sources');
```

**References.** `masterPeopleId → master_people._id`. `people_matches`, `people_aliases`, and `people_locations` may reference a specific `people_sources._id`.

**Denormalization.** Intentionally **none beyond `rawAttributes`** — this collection is the canonical, append-only-ish raw store. **Extensibility:** a new data source is just a **new `sourceType` value + `rawAttributes`** payload; no schema change is required, because unmapped columns live in the Mixed field.

---

## 3. `people_matches`

**Purpose.** Audit trail of **every** match/merge decision (the 5-tier algorithm and 0–100 confidence scoring from Step 3). It is the logical equivalent of the `source_mappings` entity in `02-master-people-model.md`. Each document records why two records were (or were not) merged, who decided, and with what confidence.

```js
const peopleMatchesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },

    fromSourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable
    toSourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', required: true },

    matchType: {
      type: String,
      enum: ['CROSS_REFERENCE', 'EXACT_ID', 'COUNTRY', 'NAME_SIMILARITY', 'GEO_PROXIMITY', 'MANUAL'],
      required: true,
    },
    matchTier: { type: Number, min: 1, max: 5, required: true }, // 1 = strongest
    confidence: { type: Number, min: 0, max: 100, required: true },
    confidenceBand: {
      type: String,
      enum: ['AUTO_MERGE', 'MANUAL_REVIEW', 'KEEP_SEPARATE'],
      required: true,
    },

    crossReferenceType: { type: String, default: null }, // e.g. 'PEID<->PeopleID3'
    decidedBy: { type: String, default: 'system' },       // 'system' or a user id
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleMatchesSchema.index({ masterPeopleId: 1 });   // all decisions for a group
peopleMatchesSchema.index({ confidenceBand: 1 });   // review queue (MANUAL_REVIEW)
peopleMatchesSchema.index({ matchTier: 1 });         // tier analytics

module.exports = mongoose.model('PeopleMatch', peopleMatchesSchema, 'people_matches');
```

**References.** `masterPeopleId → master_people._id`; `fromSourceId` / `toSourceId → people_sources._id` (`fromSourceId` nullable for tier-1 cross-reference seeds).

**Denormalization.** None — this is a normalized audit log. `confidenceBand` is stored (not just `confidence`) so the manual-review queue is a single indexed equality query rather than a range scan.

---

## 4. `people_aliases`

**Purpose.** Alternate/alternate-spelling names for a master people, drawn from across and within sources. Used for **search and disambiguation only** — per the core business rules, **name is never the primary matching key**.

```js
const peopleAliasesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable

    alias: { type: String, required: true, trim: true },
    aliasType: {
      type: String,
      enum: ['NAME_ACROSS', 'NAME_IN_COUNTRY', 'DISPLAY', 'ALTERNATE', 'ROP3', 'PGID', 'PEID'],
      required: true,
    },
    sourceType: { type: String, default: null },   // which source contributed this alias
    languageCode: { type: String, default: null }, // ISO 639-3 if known
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleAliasesSchema.index({ masterPeopleId: 1 }); // all aliases for a group
peopleAliasesSchema.index({ alias: 'text' });      // free-text alias search

module.exports = mongoose.model('PeopleAlias', peopleAliasesSchema, 'people_aliases');
```

**References.** `masterPeopleId → master_people._id`; `sourceId → people_sources._id` (nullable for system-generated/canonical aliases).

**Denormalization.** `sourceType` is duplicated from the parent `people_sources` document so alias search can label provenance without an extra lookup.

---

## 5. `people_locations`

**Purpose.** All known coordinates for a master people, one document per point, stored as **GeoJSON `Point`** with a **`2dsphere`** index — mirroring the `location` shape in `PeopleGroup.js`. Exactly one location per group is flagged `isPrimary` and is the one copied into `master_people.primaryLocation`.

```js
const PointSubSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const peopleLocationsSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true },
    sourceId: { type: Schema.Types.ObjectId, ref: 'PeopleSource', default: null }, // nullable

    geom: { type: PointSubSchema, required: true }, // 2dsphere indexed; coordinates [lng, lat]

    // Convenience scalars (denormalized from geom for simple reads/exports)
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    countryCode: { type: String, default: null }, // ISO3
    isPrimary: { type: Boolean, default: false },
    sourceType: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
peopleLocationsSchema.index({ masterPeopleId: 1 }); // all points for a group
peopleLocationsSchema.index({ geom: '2dsphere' });   // $near / $geoWithin (replaces PostGIS ST_DWithin)

module.exports = mongoose.model('PeopleLocation', peopleLocationsSchema, 'people_locations');
```

**References.** `masterPeopleId → master_people._id`; `sourceId → people_sources._id` (nullable).

**Denormalization.** `latitude` / `longitude` mirror `geom.coordinates` for trivially simple reads and CSV exports; `geom` remains authoritative for all geospatial queries. The `isPrimary` point is denormalized up to `master_people.primaryLocation`.

---

## 6. `people_statuses`

**Purpose.** The reached/engagement status for a master people — exactly **one document per group** (`masterPeopleId` is unique). Its summary fields (`status`, `jpScale`, `leastReached`) are denormalized onto `master_people.status`.

```js
const peopleStatusesSchema = new Schema(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },

    masterPeopleId: { type: Schema.Types.ObjectId, ref: 'MasterPeople', required: true }, // unique

    status: {
      type: String,
      enum: ['UNREACHED', 'FRONTIER', 'MINIMALLY_REACHED', 'REACHED', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    jpScale: { type: Number, default: null },          // 1–5
    leastReached: { type: Boolean, default: null },
    frontier: { type: Boolean, default: null },
    percentEvangelical: { type: Number, default: null },
    percentChristian: { type: Number, default: null },
    engagementStatus: { type: String, default: null },
    bibleStatus: { type: String, default: null },
    derivedFromSource: { type: String, default: null }, // which source set this status
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

// Indexes
peopleStatusesSchema.index({ masterPeopleId: 1 }, { unique: true }); // one status per group

module.exports = mongoose.model('PeopleStatus', peopleStatusesSchema, 'people_statuses');
```

**References.** `masterPeopleId → master_people._id` (unique).

**Denormalization.** `status`, `jpScale`, and `leastReached` are copied into `master_people.status` so the map and statistics endpoints can read/aggregate reached status without joining `people_statuses`.

---

## Indexes summary

| Collection | Index | Field(s) | Why (query pattern served) |
| --- | --- | --- | --- |
| `master_people` | `{ rop3: 1 }` *(sparse)* | `rop3` | ROP3 lookups; sparse because ~24.9% of CPPI rows lack ROP3 (don't index nulls). |
| `master_people` | `{ primaryCountryCode: 1 }` | `primaryCountryCode` | Country filters and facet counts. |
| `master_people` | `{ sourceTypes: 1 }` | `sourceTypes` (multikey) | Map **source-visibility** filtering (e.g. "show groups attested by JP") with no join. |
| `master_people` | `{ primaryLocation: '2dsphere' }` | `primaryLocation` | Map viewport `$geoWithin` / `$near` for marker rendering. |
| `master_people` | `canonicalName` *(text)* | `canonicalName` | Name search (signal only). |
| `people_sources` | `{ masterPeopleId: 1 }` | `masterPeopleId` | Fetch all source records for a group. |
| `people_sources` | `{ sourceType: 1, sourceRecordId: 1 }` *(unique)* | `sourceType`, `sourceRecordId` | Idempotent imports / upserts; prevents duplicate source records. |
| `people_sources` | `{ rop3: 1 }` | `rop3` | Cross-reference and grouping by ROP3. |
| `people_sources` | `{ peopleId3: 1 }` | `peopleId3` | JP `PeopleID3` joins to the cross-reference. |
| `people_sources` | `{ peid: 1 }` | `peid` | CPPI `PEID` joins to the cross-reference. |
| `people_matches` | `{ masterPeopleId: 1 }` | `masterPeopleId` | All match decisions for a group. |
| `people_matches` | `{ confidenceBand: 1 }` | `confidenceBand` | Manual-review queue (`MANUAL_REVIEW`) as an indexed equality. |
| `people_matches` | `{ matchTier: 1 }` | `matchTier` | Tier distribution analytics. |
| `people_aliases` | `{ masterPeopleId: 1 }` | `masterPeopleId` | All aliases for a group. |
| `people_aliases` | `alias` *(text)* | `alias` | Free-text alias search. |
| `people_locations` | `{ masterPeopleId: 1 }` | `masterPeopleId` | All points for a group. |
| `people_locations` | `{ geom: '2dsphere' }` | `geom` | `$near` / `$geoWithin` (replaces PostGIS `ST_DWithin`). |
| `people_statuses` | `{ masterPeopleId: 1 }` *(unique)* | `masterPeopleId` | Exactly one status document per group. |

> Two text indexes (`master_people.canonicalName` and `people_aliases.alias`) live on **different collections**, which is allowed — MongoDB permits at most one text index *per collection*.

---

## Performance considerations

- **Read-optimized `master_people` for the map.** The denormalized `sourceTypes`, `primaryLocation`, and `status` mean `GET /map/markers` answers from a **single `master_people` scan** with the `2dsphere` and `sourceTypes` indexes — **no joins**, one marker per group. This is the dominant read path and the reason the summary is duplicated.
- **`people_sources` carries the write-heavy, lossless raw data.** Imports and re-syncs churn here (upserts keyed by `{ sourceType, sourceRecordId }`), keeping the hot read collection (`master_people`) small and stable. `rawAttributes` (Mixed) preserves every original column with zero schema migrations.
- **Separate collections vs bounded arrays.** Sources, locations, and aliases are **separate collections rather than embedded arrays** because their cardinality is **unbounded and grows with each new source** (JP, CPPI, DMM, FTT, surveys, …). Embedding would risk unbounded document growth and the 16 MB document limit, and would force rewrites of the hot `master_people` doc on every source change. `people_statuses` is one-per-group, so it is embedded *as a summary* on `master_people` while remaining a standalone collection of record.
- **`lean()` + projection for `/map/markers`.** Use `find(query).select('canonicalName primaryLocation sourceTypes status totalPopulation').lean()` to skip Mongoose hydration and return plain objects — minimal payload, maximal throughput for tens of thousands of markers.
- **Compound + sparse indexes.** `{ sourceType: 1, sourceRecordId: 1 }` (unique) makes imports idempotent; the **sparse** `{ rop3: 1 }` avoids indexing the ~24.9% of CPPI rows with no ROP3, keeping the index small and selective.
- **Aggregation pipeline for `/map/statistics`.** Compute counts and breakdowns (by `status`, `primaryCountryCode`, `sourceTypes`) with a `$group` aggregation over `master_people` (and `$unwind` of `sourceTypes` where a per-source tally is needed) — served by the same indexes, again **without** touching the child collections.
- **Geospatial.** All proximity / containment queries use the `2dsphere` indexes on `master_people.primaryLocation` and `people_locations.geom` via `$near` / `$geoWithin`, fully replacing PostGIS `GEOGRAPHY` + `ST_DWithin`. Name similarity for matching is computed in application code (Dice/Jaro), replacing `pg_trgm`, and is used only as a confidence **signal** — never as the primary key.
