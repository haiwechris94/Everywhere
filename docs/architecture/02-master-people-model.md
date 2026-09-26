# Step 2 — Canonical "Master People" Logical Model

The canonical entity is **`master_people`**: it represents **one ethnic group independent of any source**. Each source's view of that group (a JP per-country row, a CPPI row, a future DMM survey, etc.) is attached as a `people_sources` record. Identity is anchored on **ROP3 + the official cross-reference**, **never on names**.

## 2.1 Entity Map

```
master_people  1 ─── *  people_sources  1 ─── *  source_aliases
      │                       │
      │                       └── *  people_coordinates
      │                       └── (raw_attributes JSONB on the source row)
      ├─── *  source_mappings   (audit of every match decision between two sources)
      └─── 1  people_status     (aggregated engagement / reached status)
```

- **`master_people`** — the canonical ethnic group (the thing that becomes one marker).
- **`people_sources`** — one row per (source, source-record) contributing to a master people; holds the raw payload.
- **`source_mappings`** — the audit trail of *why* two source records were merged (match tier, score, type).
- **`source_aliases`** — every name/identifier variant seen across sources, for search and disambiguation.
- **`people_coordinates`** — geo points contributed by sources (a master people can have several).
- **`people_status`** — aggregated reached/engagement/Bible status for the canonical group.

---

## 2.2 `master_people`

The source-agnostic canonical ethnic group. **Names are descriptive, never the key.**

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Stable surrogate primary key. Identity is the UUID, **not** any name. | `b3f1…-9c2a` |
| `canonical_name` | TEXT | No | Best human-readable display name (chosen by priority, see §2.8). Descriptive only. | `Hausa` |
| `rop3` | TEXT | Yes | Registry of Peoples (ethnic-group) ID — the authoritative cross-source natural key. Nullable because some CPPI rows lack it. | `109876` |
| `rop2` | TEXT | Yes | People-cluster Registry ID (rollup of ROP3). | `B021` |
| `rop1` | TEXT | Yes | Affinity-bloc Registry ID. | `A012` |
| `primary_country_code` | CHAR(3) | Yes | ISO-3166 alpha-3 of the "home"/largest-population country (for default map placement). | `NGA` |
| `primary_language_name` | TEXT | Yes | Best-known primary language label. | `Hausa` |
| `rol3` | TEXT | Yes | Registry of Languages ID (ISO 639-3-aligned). | `hau` |
| `affinity_bloc` | TEXT | Yes | Affinity bloc label. | `Sub-Saharan Peoples` |
| `people_cluster` | TEXT | Yes | People cluster label. | `Hausa` |
| `total_population` | BIGINT | Yes | Aggregated/best population estimate across sources. | `83000000` |
| `created_at` | TIMESTAMPTZ | No | Row creation time. | `2024-05-01T10:00:00Z` |
| `updated_at` | TIMESTAMPTZ | No | Last modification time. | `2024-05-01T10:00:00Z` |

> **Why ROP3 is nullable:** §1.3 shows 3,086 CPPI rows and 25 JP rows lack `ROP3`. A master people created from such rows still needs an identity (the UUID); `rop3` is populated later if a cross-reference or future sync supplies one.

---

## 2.3 `people_sources`

One row per source record that contributes to a `master_people`. **Preserves every original source identifier and the full raw payload.**

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Surrogate PK for the source contribution. | `7a21…` |
| `master_people_id` | UUID (FK → `master_people.id`) | No | The canonical group this source row belongs to. | `b3f1…` |
| `source_type` | TEXT (enum) | No | Which dataset. One of `JP`, `CPPI`, `DMM`, `FTT`, `SURVEY`, `MANUAL`. | `JP` |
| `source_record_id` | TEXT | No | The source's own primary key (e.g. JP `PeopleID3`, CPPI `PEID`). | `12345` |
| `people_id3` | TEXT | Yes | JP `PeopleID3` (per people-in-country). Preserved verbatim. | `12345` |
| `people_id2` | TEXT | Yes | JP `PeopleID2`. | `2201` |
| `people_id1` | TEXT | Yes | JP `PeopleID1`. | `301` |
| `peid` | TEXT | Yes | CPPI internal `PEID`. | `48217` |
| `pgid` | TEXT | Yes | CPPI `PGID` (e.g. `PG024371`). | `PG024371` |
| `rop3` | TEXT | Yes | Source-level ROP3 (may differ from master if data-quality issue). | `109876` |
| `rop2` | TEXT | Yes | Source-level ROP2. | `B021` |
| `rop1` | TEXT | Yes | Source-level ROP1. | `A012` |
| `country_code` | CHAR(3) | Yes | ISO alpha-3 for this source row (JP `ROG3`, CPPI `ISOalpha3`). | `NGA` |
| `country_name` | TEXT | Yes | Source `Ctry`. | `Nigeria` |
| `source_name` | TEXT | Yes | Name as given by this source (JP `PeopNameInCountry`, CPPI `NmDisp`). | `Hausa` |
| `population` | BIGINT | Yes | Population reported by this source. | `63000000` |
| `raw_attributes` | JSONB | No | **The entire original row** as key/value JSON — all source-specific columns (JPScale, EvngLvl, BibleStatus, GSEC, etc.) preserved losslessly. | `{ "JPScale": "1", "LeastReached": "Y", … }` |
| `imported_at` | TIMESTAMPTZ | No | When this source row was ingested. | `2024-05-01T10:00:00Z` |
| `source_updated_at` | TIMESTAMPTZ | Yes | The source's own last-updated (CPPI `UpdatedDate`). | `2024-03-12` |

> **Extensibility:** Adding DMM / Finishing The Task / surveys means adding rows with a new `source_type` and dumping their columns into `raw_attributes`. **No schema change required.**

---

## 2.4 `source_mappings`

Audit trail of **every match decision** that linked source records into a master people. This is what lets us explain and reverse merges.

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Surrogate PK. | `f0c2…` |
| `master_people_id` | UUID (FK → `master_people.id`) | No | The canonical group the decision resolved to. | `b3f1…` |
| `from_source_id` | UUID (FK → `people_sources.id`) | Yes | One side of the match (nullable for the seed record). | `7a21…` |
| `to_source_id` | UUID (FK → `people_sources.id`) | No | The other side of the match. | `9b55…` |
| `match_type` | TEXT (enum) | No | How the link was made: `CROSS_REFERENCE`, `EXACT_ID`, `COUNTRY`, `NAME_SIMILARITY`, `GEO_PROXIMITY`, `MANUAL`. | `CROSS_REFERENCE` |
| `match_tier` | SMALLINT | No | Priority tier 1–5 (see Step 3). | `1` |
| `confidence` | SMALLINT | No | 0–100 confidence score. | `100` |
| `confidence_band` | TEXT (enum) | No | `AUTO_MERGE`, `MANUAL_REVIEW`, `KEEP_SEPARATE`. | `AUTO_MERGE` |
| `cross_reference_type` | TEXT | Yes | The XLSX `Type` value when the match came from the cross-reference. | `Exact` |
| `decided_by` | TEXT | Yes | `system` or a reviewer identifier (for manual decisions). | `system` |
| `created_at` | TIMESTAMPTZ | No | When the decision was recorded. | `2024-05-01T10:00:00Z` |

---

## 2.5 `source_aliases`

Every name and identifier variant observed — powers search and disambiguation, **without** being part of the key.

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Surrogate PK. | `c1a9…` |
| `master_people_id` | UUID (FK → `master_people.id`) | No | The canonical group this alias belongs to. | `b3f1…` |
| `source_id` | UUID (FK → `people_sources.id`) | Yes | The source row that supplied the alias (nullable for curated aliases). | `7a21…` |
| `alias` | TEXT | No | The name/identifier variant. | `Haoussa` |
| `alias_type` | TEXT (enum) | No | `NAME_ACROSS`, `NAME_IN_COUNTRY`, `DISPLAY`, `ALTERNATE`, `ROP3`, `PGID`, `PEID`. | `ALTERNATE` |
| `source_type` | TEXT | Yes | Originating dataset (`JP`, `CPPI`, …). | `CPPI` |
| `language_code` | TEXT | Yes | ISO language of the alias text, if known. | `fr` |
| `created_at` | TIMESTAMPTZ | No | Creation time. | `2024-05-01T10:00:00Z` |

---

## 2.6 `people_coordinates`

Geographic points contributed by sources. A master people may have several (one per source/country); the marker uses the primary.

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Surrogate PK. | `e7d3…` |
| `master_people_id` | UUID (FK → `master_people.id`) | No | The canonical group. | `b3f1…` |
| `source_id` | UUID (FK → `people_sources.id`) | Yes | The source row that supplied the point. | `7a21…` |
| `geom` | GEOGRAPHY(Point,4326) | No | The lat/long point (WGS84) for PostGIS spatial ops. | `POINT(8.52 11.99)` |
| `latitude` | DOUBLE PRECISION | Yes | Raw latitude (audit/debug). | `11.99` |
| `longitude` | DOUBLE PRECISION | Yes | Raw longitude (audit/debug). | `8.52` |
| `country_code` | CHAR(3) | Yes | Country the point belongs to. | `NGA` |
| `is_primary` | BOOLEAN | No | Whether this is the marker's display point. | `true` |
| `source_type` | TEXT | Yes | Originating dataset. | `JP` |
| `created_at` | TIMESTAMPTZ | No | Creation time. | `2024-05-01T10:00:00Z` |

---

## 2.7 `people_status`

Aggregated engagement / reached status for the canonical group (rolled up across sources, with provenance).

| Field | Type | Null? | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | UUID (PK) | No | Surrogate PK. | `aa01…` |
| `master_people_id` | UUID (FK → `master_people.id`) | No | The canonical group (unique — one status row per people). | `b3f1…` |
| `status` | TEXT (enum) | No | Aggregated reached status: `UNREACHED`, `FRONTIER`, `MINIMALLY_REACHED`, `REACHED`, `UNKNOWN`. | `FRONTIER` |
| `jp_scale` | SMALLINT | Yes | JP Progress Scale 1–5. | `1` |
| `least_reached` | BOOLEAN | Yes | JP `LeastReached` flag. | `true` |
| `frontier` | BOOLEAN | Yes | JP `Frontier` flag. | `true` |
| `percent_evangelical` | NUMERIC(6,3) | Yes | Best evangelical % across sources. | `0.012` |
| `percent_christian` | NUMERIC(6,3) | Yes | Best Christian-adherent %. | `1.250` |
| `engagement_status` | TEXT | Yes | CPPI `EngStat` rollup (engaged / unengaged). | `Unengaged` |
| `bible_status` | TEXT | Yes | Scripture availability (JP `BibleStatus`). | `Portions` |
| `derived_from_source` | TEXT | Yes | Which source the headline status came from. | `JP` |
| `updated_at` | TIMESTAMPTZ | No | Last recompute time. | `2024-05-01T10:00:00Z` |

---

## 2.8 Identity & Naming Rules

1. **Primary key is the UUID.** Names are *never* the primary key, and never used to test identity by themselves.
2. **Authoritative matching keys:** the official JP↔CPPI cross-reference (highest), then `ROP3`, then source internal IDs (`PeopleID3` / `PEID`).
3. **All original IDs preserved:** `PeopleID3`, `PeopleID1`, `PeopleID2`, `PEID`, `PGID`, `ROP3`, `ROP2`, `ROP1`, `ROG3`/`ISOalpha3` live on `people_sources` (and the canonical rollups on `master_people`).
4. **All source-specific attributes preserved** losslessly in `people_sources.raw_attributes` (JSONB).
5. **`canonical_name` selection priority:** JP `PeopNameAcrossCountries` → CPPI `NmDisp` → JP `PeopNameInCountry` → CPPI `Name`. Every variant is still stored in `source_aliases`.
6. **Extensible by design:** new sources (DMM, Finishing The Task, surveys) attach as `people_sources` rows with a new `source_type` and their own `raw_attributes`; no DDL change is needed.
