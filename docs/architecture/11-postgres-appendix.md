# Appendix — PostgreSQL / PostGIS DDL (Optional Future Migration)

> **This is an OPTIONAL future-migration target, not the primary design.**
>
> The live production stack is **MongoDB + Mongoose** (see [04-mongodb-schemas.md](./04-mongodb-schemas.md)). This appendix exists because the original brief requested PostgreSQL/PostGIS DDL and because a relational target may be desirable later if the team wants SQL-native entity-resolution pipelines or heavy spatial analytics.
>
> **Running this SQL does NOT affect the running MongoDB environment in any way.** It is inert documentation: the application connects only to MongoDB (`mongoose.connect`), has **no** `pg` / `sequelize` / `prisma` dependency, and never reads this file. Provisioning Postgres from this DDL is a deliberate, separate infrastructure decision.

This appendix is the physical realization of the logical model in [02-master-people-model.md](./02-master-people-model.md). The six tables map 1:1 to the six canonical entities. Column names, types, and nullability match §2.2–§2.7.

## Extensions

```sql
-- Spatial types & operators (GEOGRAPHY, ST_DWithin, GiST indexes)
CREATE EXTENSION IF NOT EXISTS postgis;
-- Trigram similarity for name-as-a-signal matching (Tier 4). Never the primary key.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

## Schema

```sql
BEGIN;

-- =====================================================================
-- 1. master_people — one canonical ethnic group (becomes one map marker)
--    Identity = UUID. Names are NEVER the primary key.
-- =====================================================================
CREATE TABLE master_people (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_name        TEXT        NOT NULL,
    rop3                  TEXT,                 -- authoritative cross-source natural key (nullable: 3,086 CPPI + 25 JP rows lack it)
    rop2                  TEXT,                 -- people-cluster registry id
    rop1                  TEXT,                 -- affinity-bloc registry id
    primary_country_code  CHAR(3),              -- ISO-3166 alpha-3 of home/largest-population country
    primary_language_name TEXT,
    rol3                  TEXT,                 -- registry of languages id (ISO 639-3 aligned)
    affinity_bloc         TEXT,
    people_cluster        TEXT,
    total_population      BIGINT CHECK (total_population IS NULL OR total_population >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE  master_people IS 'Source-agnostic canonical ethnic group; one row = one map marker. PK is the UUID, never a name.';
COMMENT ON COLUMN master_people.rop3 IS 'Registry of Peoples ethnic-group id; nullable because some CPPI/JP rows lack it.';

-- =====================================================================
-- 2. people_sources — one row per (source, source-record) contribution.
--    Preserves every original identifier and the FULL raw payload (JSONB).
-- =====================================================================
CREATE TABLE people_sources (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_people_id  UUID NOT NULL REFERENCES master_people(id) ON DELETE CASCADE,
    source_type       TEXT NOT NULL CHECK (source_type IN ('JP','CPPI','DMM','FTT','SURVEY','MANUAL')),
    source_record_id  TEXT NOT NULL,           -- the source's own PK (JP PeopleID3, CPPI PEID, ...)
    people_id3        TEXT,                     -- JP PeopleID3 (per people-in-country)
    people_id2        TEXT,                     -- JP PeopleID2
    people_id1        TEXT,                     -- JP PeopleID1
    peid              TEXT,                     -- CPPI internal PEID
    pgid              TEXT,                     -- CPPI PGID (e.g. PG024371)
    rop3              TEXT,
    rop2              TEXT,
    rop1              TEXT,
    country_code      CHAR(3),                  -- JP ROG3 / CPPI ISOalpha3
    country_name      TEXT,                     -- source Ctry
    source_name       TEXT,                     -- JP PeopNameInCountry / CPPI NmDisp
    population        BIGINT CHECK (population IS NULL OR population >= 0),
    raw_attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- ENTIRE original row, lossless
    imported_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_updated_at TIMESTAMPTZ,              -- source's own last-updated (CPPI UpdatedDate)
    CONSTRAINT uq_people_sources_source UNIQUE (source_type, source_record_id)
);
COMMENT ON TABLE  people_sources IS 'Original source rows attached to a master people; extensible to new sources with no DDL change (raw_attributes JSONB).';
COMMENT ON COLUMN people_sources.raw_attributes IS 'Full original row as JSON — all source-specific columns preserved losslessly.';

-- =====================================================================
-- 3. source_mappings — audit of every match/merge decision (explain & reverse)
-- =====================================================================
CREATE TABLE source_mappings (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_people_id     UUID NOT NULL REFERENCES master_people(id) ON DELETE CASCADE,
    from_source_id       UUID REFERENCES people_sources(id) ON DELETE SET NULL,  -- nullable for seed record
    to_source_id         UUID NOT NULL REFERENCES people_sources(id) ON DELETE CASCADE,
    match_type           TEXT NOT NULL CHECK (match_type IN
                            ('CROSS_REFERENCE','EXACT_ID','COUNTRY','NAME_SIMILARITY','GEO_PROXIMITY','MANUAL')),
    match_tier           SMALLINT NOT NULL CHECK (match_tier BETWEEN 1 AND 5),
    confidence           SMALLINT NOT NULL CHECK (confidence BETWEEN 0 AND 100),
    confidence_band      TEXT NOT NULL CHECK (confidence_band IN ('AUTO_MERGE','MANUAL_REVIEW','KEEP_SEPARATE')),
    cross_reference_type TEXT,                  -- XLSX 'Type' value when match came from cross-reference
    decided_by           TEXT DEFAULT 'system', -- 'system' or reviewer id
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE source_mappings IS 'Audit trail of why two source records were merged; enables review queue and reversal.';

-- =====================================================================
-- 4. source_aliases — every name/identifier variant (search & disambiguation)
-- =====================================================================
CREATE TABLE source_aliases (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_people_id  UUID NOT NULL REFERENCES master_people(id) ON DELETE CASCADE,
    source_id         UUID REFERENCES people_sources(id) ON DELETE SET NULL,   -- nullable for curated aliases
    alias             TEXT NOT NULL,
    alias_type        TEXT NOT NULL CHECK (alias_type IN
                        ('NAME_ACROSS','NAME_IN_COUNTRY','DISPLAY','ALTERNATE','ROP3','PGID','PEID')),
    source_type       TEXT,
    language_code     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE source_aliases IS 'Name/identifier variants across sources; supports search but is NEVER part of the identity key.';

-- =====================================================================
-- 5. people_coordinates — geo points contributed by sources (PostGIS)
-- =====================================================================
CREATE TABLE people_coordinates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_people_id  UUID NOT NULL REFERENCES master_people(id) ON DELETE CASCADE,
    source_id         UUID REFERENCES people_sources(id) ON DELETE SET NULL,
    geom              GEOGRAPHY(Point,4326) NOT NULL,  -- WGS84 point for ST_DWithin / spatial ops
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    country_code      CHAR(3),
    is_primary        BOOLEAN NOT NULL DEFAULT false,  -- the marker's display point
    source_type       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE people_coordinates IS 'All coordinates for a master people (one per source/country); is_primary flags the marker point.';

-- =====================================================================
-- 6. people_status — aggregated engagement / reached status (one per group)
-- =====================================================================
CREATE TABLE people_status (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_people_id    UUID NOT NULL UNIQUE REFERENCES master_people(id) ON DELETE CASCADE,
    status              TEXT NOT NULL CHECK (status IN
                          ('UNREACHED','FRONTIER','MINIMALLY_REACHED','REACHED','UNKNOWN')),
    jp_scale            SMALLINT CHECK (jp_scale IS NULL OR jp_scale BETWEEN 1 AND 5),
    least_reached       BOOLEAN,
    frontier            BOOLEAN,
    percent_evangelical NUMERIC(6,3) CHECK (percent_evangelical IS NULL OR percent_evangelical BETWEEN 0 AND 100),
    percent_christian   NUMERIC(6,3) CHECK (percent_christian   IS NULL OR percent_christian   BETWEEN 0 AND 100),
    engagement_status   TEXT,                   -- CPPI EngStat rollup
    bible_status        TEXT,                   -- JP BibleStatus
    derived_from_source TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE people_status IS 'One aggregated status row per master people, with provenance of the headline status.';

COMMIT;
```

## Indexes

```sql
-- Join / lookup keys
CREATE INDEX idx_master_people_rop3          ON master_people (rop3);
CREATE INDEX idx_master_people_country       ON master_people (primary_country_code);
CREATE INDEX idx_people_sources_master       ON people_sources (master_people_id);
CREATE INDEX idx_people_sources_rop3         ON people_sources (rop3);
CREATE INDEX idx_people_sources_people_id3   ON people_sources (people_id3);
CREATE INDEX idx_people_sources_peid         ON people_sources (peid);
CREATE INDEX idx_people_sources_country      ON people_sources (country_code);
CREATE INDEX idx_source_mappings_master      ON source_mappings (master_people_id);
CREATE INDEX idx_source_mappings_band        ON source_mappings (confidence_band);  -- drives the manual-review queue
CREATE INDEX idx_source_aliases_master       ON source_aliases (master_people_id);
CREATE INDEX idx_people_coordinates_master   ON people_coordinates (master_people_id);

-- JSONB: query any preserved source-specific attribute
CREATE INDEX idx_people_sources_raw_gin      ON people_sources USING GIN (raw_attributes);

-- Spatial: GiST for GEOGRAPHY (map bbox / ST_DWithin proximity, Tier 5)
CREATE INDEX idx_people_coordinates_geom     ON people_coordinates USING GIST (geom);

-- Name-as-a-signal (Tier 4 only — never the primary key)
CREATE INDEX idx_source_aliases_alias_trgm   ON source_aliases USING GIN (alias gin_trgm_ops);
```

## MongoDB ↔ PostgreSQL mapping

| MongoDB (primary — Step 4) | PostgreSQL (this appendix) | Notes |
| --- | --- | --- |
| `master_people` collection, `_id: ObjectId` | `master_people`, `id UUID` | Denormalized `sourceTypes[]`, `primaryLocation`, `status` in Mongo → columns / joins in SQL. |
| Embedded/`ObjectId` refs | `UUID` FKs with `ON DELETE CASCADE` | Referential integrity enforced by the DB in SQL. |
| GeoJSON `Point` + `2dsphere` | `GEOGRAPHY(Point,4326)` + GiST | `$near`/`$geoWithin` ↔ `ST_DWithin`/`&&`. |
| `sourceData` (Mixed) | `raw_attributes` (JSONB) + GIN | Lossless raw payload in both. |
| App-side Dice/Jaro name similarity | `pg_trgm` (`gin_trgm_ops`) | Name is a Tier-4 signal only in both. |

> Migrating later means exporting the Mongo collections and loading them into these tables (the loader in [05-migration-workflows.md](./05-migration-workflows.md) can target either engine). No application behavior, API contract, or map logic changes — only the persistence layer.
