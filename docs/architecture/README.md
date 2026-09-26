# Master People Architecture Proposal

> **Design + Migration Proposal** — Merging Joshua Project (JP) and IMB / PeopleGroups.org (CPPI) people-group data into a single canonical **Master People** entity, where **one ethnic group = one map marker**.

## Executive Summary

This proposal defines a source-agnostic canonical data model ("Master People") that unifies multiple people-group datasets — starting with Joshua Project (JP) and IMB / PeopleGroups.org (CPPI) — into one entity per ethnic group while preserving every original source identifier and attribute. Matching is driven by an authoritative JP↔CPPI cross-reference and a deterministic, identifier-first merge algorithm with a transparent 0–100 confidence score (90–100 auto-merge, 70–89 manual review, 0–69 keep separate). The result is exactly **one marker per ethnic group** on the map, with all contributing sources (JP, CPPI, and future DMM / Finishing The Task / surveys) attached and individually toggleable. The proposal targets **MongoDB 6+ (Mongoose) with 2dsphere geospatial indexes** and a **Leaflet** frontend, and includes the full data analysis, logical and physical schema, merge algorithm, ordered migration process, REST API, map redesign, and implementation artifacts.

---

> ## NOTE: Current Stack & Target Stack — MongoDB-First
>
> The **current production stack is MongoDB + Mongoose** (Express backend). The relevant models are:
> - `backend/models/PeopleGroup.js` — people groups, GeoJSON `Point` location `[lng, lat]`, a `source` enum (`['DMM','manual','Survey','Joshua Project','IMB','PeopleGroups.org','Finishing the Task']`), a `jpData` subdocument, and a `sourceData` Mixed field for raw columns.
> - `backend/models/People.js`
>
> This proposal **targets MongoDB as the primary database**. The canonical **Master People** model is implemented as **MongoDB collections** (Mongoose schemas) with **ObjectId** references and **2dsphere** geospatial indexes — it is a natural extension of the stack already in production, not a migration to a different engine.
>
> The canonical model is **storage-agnostic in spirit** — the entities, merge algorithm, confidence bands, API surface, and map behaviour stand on their own — but **all schemas, indexes, and queries below are MongoDB**. Geospatial matching uses MongoDB `2dsphere` with `$near` / `$geoWithin` (no PostGIS `ST_DWithin`), and name similarity is computed **application-side** (e.g. Dice/Jaro; no `pg_trgm`), with name treated as a *signal only*.
>
> A full **PostgreSQL/PostGIS DDL** for the same six entities is preserved as an **optional future-migration appendix** ([11-postgres-appendix.md](./11-postgres-appendix.md)). It is inert documentation and does **not** touch the running MongoDB environment (the app has no Postgres client wired in).
>
> ### Canonical MongoDB collections
>
> The model is realized directly as six MongoDB collections:
>
> - `master_people` — one document per ethnic group (`_id` = `ObjectId`).
> - `people_sources` — every original source record, referencing `masterPeopleId`; full raw row preserved in a Mixed field (mirrors `PeopleGroup.sourceData`).
> - `people_matches` — audit of every match/merge decision.
> - `people_aliases` — alternate names across sources (name is a signal only).
> - `people_locations` — GeoJSON `Point` documents with a `2dsphere` index.
> - `people_statuses` — reached/engagement status, one per master people.

---

## Document Index

| # | Document | Description |
| --- | --- | --- |
| — | [README.md](./README.md) | This index, executive summary, and stack note. |
| 1 | [01-data-analysis.md](./01-data-analysis.md) | **Step 1** — Real-statistics analysis of JP, CPPI, and the cross-reference; merge projections (auto-merge / manual-review / keep-separate). |
| 2 | [02-master-people-model.md](./02-master-people-model.md) | **Step 2** — Canonical `MASTER_PEOPLE` logical model and six supporting entities, every field explained. |
| 3 | [03-merge-algorithm.md](./03-merge-algorithm.md) | **Step 3** — 5-tier merge algorithm, 0–100 confidence scoring, pseudocode, worked example. |
| 4 | [04-mongodb-schemas.md](./04-mongodb-schemas.md) | **Step 4** — Production MongoDB document schemas (Mongoose), ObjectIds, references, indexes, denormalization, performance. |
| 5 | [05-migration-workflows.md](./05-migration-workflows.md) | **Step 5** — Migration workflows Phases A–G (CPPI import, JP sync, cross-reference, generate master/sources/aliases/markers). |
| 6 | [06-synchronization.md](./06-synchronization.md) | **Step 6** — Joshua Project API synchronization; preserve master people, manual merges, approved mappings; conflict resolution. |
| 7 | [07-map-architecture.md](./07-map-architecture.md) | **Step 7** — Leaflet map redesign: one master people = one marker; clustering, filtering, source visibility, popups, stats, search. |
| 8 | [08-api-architecture.md](./08-api-architecture.md) | **Step 8** — REST API endpoints; always returns master people. |
| 9 | [09-conflict-resolution.md](./09-conflict-resolution.md) | **Step 9** — Conflict resolution for population/location/naming/country/status differences. |
| 10 | [10-implementation-artifacts.md](./10-implementation-artifacts.md) | **Step 10** — Mermaid architecture + ER diagrams; migration/sync/merge/conflict/map/API workflows. |
| 11 | [11-postgres-appendix.md](./11-postgres-appendix.md) | **Appendix** ÔÇö Optional PostgreSQL/PostGIS DDL for the six entities (future migration target; inert ÔÇö does not affect the live MongoDB environment). |

## Source Data (reference)

| Source | File | Delimiter | Notes |
| --- | --- | --- | --- |
| Joshua Project (JP) | `backend/data/AllPeoplesInCountry.csv` | `;` | 2-line preamble; **header on line 3**. |
| IMB / PeopleGroups.org (CPPI) | `backend/data/people_groups.csv` | `;` | Header on line 1. |
| JP↔CPPI Cross-Reference | `backend/data/jp-cppi-cross-reference.xlsx` | — | **Authoritative**, pre-joined mapping (Priority-1 match source). |

## Core Business Rules

1. One people group = one marker.
2. A people group can have multiple data sources.
3. JP and CPPI merge when they represent the same people.
4. The official JP↔CPPI cross-reference is authoritative for matching.
5. **Names alone must NEVER be the primary matching key.**
6. Architecture must support future sources: DMM, Finishing The Task, surveys.
7. Preserve all source identifiers and all source-specific attributes.
8. MongoDB is the primary database; Leaflet is used for mapping.

### Collection naming

The six canonical collections use the names from the brief throughout the MongoDB schema doc (Step 4):

| Canonical collection | Purpose |
| --- | --- |
| `master_people` | One document per ethnic group. |
| `people_sources` | Original source records (JP, CPPI, …). |
| `people_aliases` | Alternate names across/within sources. |
| `people_matches` | Audit of match/merge decisions. |
| `people_locations` | GeoJSON `Point` coordinates (2dsphere). |
| `people_statuses` | Reached/engagement status (one per master people). |

Note: `02-master-people-model.md` uses near-equivalent logical names — `source_mappings` ≈ `people_matches`, `source_aliases` ≈ `people_aliases`, `people_coordinates` ≈ `people_locations`, `people_status` ≈ `people_statuses`. The MongoDB schema doc (Step 4) **standardizes on the brief's names** listed above.
