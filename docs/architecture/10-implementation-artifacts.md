# Step 10 — Implementation Artifacts

This document consolidates the full MongoDB-first design from Steps 1–9 into a single set of diagrams and workflow visuals. Everything anchors on **six MongoDB collections**: `master_people`, `people_sources`, `people_matches`, `people_aliases`, `people_locations`, and `people_statuses`. The `master_people` document carries denormalized fields for fast reads — `sourceTypes[]`, a `primaryLocation` GeoJSON `Point`, and an embedded status summary — so the map and API can serve one record per people group without fan-out queries.

Confidence bands govern how candidate records are reconciled:

- **90–100 → auto-merge** (records are combined into one master people)
- **70–89 → manual review** (queued for a human decision)
- **0–69 → keep-separate** (records remain distinct)

All GitHub-flavored Mermaid blocks below use ` ```mermaid ` fences and render natively on GitHub.

---

## 1. High-level architecture diagram

External source feeds are normalized by the ingestion/ETL layer into `staging_*` collections, run through the 5-tier matching engine, and persisted into the six canonical collections. The Express REST API reads exclusively from `master_people` and its sub-resources, and the Leaflet client renders exactly one marker per master people.

```mermaid
graph TD
    JP["Joshua Project API"]
    CPPI["CPPI / PeopleGroups.org CSV"]
    DMM["DMM"]
    FTT["Finishing The Task"]
    SURV["Surveys"]

    subgraph ETL["Ingestion / ETL layer"]
        STAGE["staging_* collections"]
    end

    ME["Matching Engine (5-tier)"]

    subgraph MONGO["MongoDB collections"]
        MP["master_people"]
        PS["people_sources"]
        PM["people_matches"]
        PA["people_aliases"]
        PL["people_locations"]
        PST["people_statuses"]
    end

    subgraph API["Express REST API"]
        EP1["/people"]
        EP2["/map/markers"]
        EP3["/map/statistics"]
    end

    MAP["Leaflet map (one marker per master people)"]

    JP --> STAGE
    CPPI --> STAGE
    DMM --> STAGE
    FTT --> STAGE
    SURV --> STAGE

    STAGE --> ME
    ME --> MP
    ME --> PS
    ME --> PM
    ME --> PA
    ME --> PL
    ME --> PST

    MP --> API
    PS --> API
    PL --> API
    PST --> API

    API --> EP1
    API --> EP2
    API --> EP3
    EP2 --> MAP
    EP3 --> MAP
    EP1 --> MAP
```

---

## 2. ER diagram (MongoDB collections)

The diagram below models the six collections with representative fields and types. MongoDB is a document database, so these relationships are **ObjectId references, not foreign keys** — cardinality is enforced by the application layer and the matching engine, not by the database. `master_people` is the aggregate root; sub-resources reference it via `masterPeopleId`.

```mermaid
erDiagram
    master_people ||--o{ people_sources : "has sources"
    master_people ||--o{ people_matches : "has match audit"
    master_people ||--o{ people_aliases : "has aliases"
    master_people ||--o{ people_locations : "has locations"
    master_people ||--|| people_statuses : "has status"

    master_people {
        ObjectId _id
        string canonicalName
        string country
        string rop3
        string_array sourceTypes
        object primaryLocation "GeoJSON Point"
        object statusSummary "embedded denormalized"
        int population
        date updatedAt
    }

    people_sources {
        ObjectId _id
        ObjectId masterPeopleId "ref"
        string sourceType "enum JP|CPPI|DMM|FTT|SURVEY"
        string externalId
        object payload "raw normalized"
        date syncedAt
    }

    people_matches {
        ObjectId _id
        ObjectId masterPeopleId "ref"
        ObjectId candidateSourceId "ref"
        int score
        string band "enum AUTO_MERGE|MANUAL_REVIEW|KEEP_SEPARATE"
        object tierBreakdown
        string decision
        date decidedAt
    }

    people_aliases {
        ObjectId _id
        ObjectId masterPeopleId "ref"
        string alias
        string sourceType
        string language
    }

    people_locations {
        ObjectId _id
        ObjectId masterPeopleId "ref"
        object geometry "GeoJSON Point"
        string sourceType
        boolean isPrimary
    }

    people_statuses {
        ObjectId _id
        ObjectId masterPeopleId "ref"
        string engagementStatus "enum"
        string dmmStage "enum"
        date asOf
    }
```

---

## 3. Migration workflow (Phases A–G)

The one-time migration bootstraps the data model from historical sources. Phases A and B feed the cross-reference step (C), which drives master creation (D) and the derived sub-resources (E–G). Candidates scoring 70–89 branch to the manual review queue; anything below 70 is kept separate. A reconciliation report closes out the run.

```mermaid
flowchart TD
    A["A. Import CPPI CSV"] --> C
    B["B. Sync JP API"] --> C
    C["C. Apply cross-reference"] --> DEC{"Confidence band"}

    DEC -->|"90-100 auto-merge"| D["D. Generate master_people"]
    DEC -->|"70-89 manual review"| MR["Manual Review queue"]
    DEC -->|"below 70 keep-separate"| KS["Keep-Separate (distinct master)"]

    MR -->|"approved"| D
    KS --> D

    D --> E["E. Source mappings (people_sources)"]
    E --> F["F. Aliases (people_aliases)"]
    F --> G["G. Geo markers (people_locations + primaryLocation)"]
    G --> RPT["Reconciliation report"]
```

---

## 4. Synchronization workflow

The recurring Joshua Project sync keeps the model current without disturbing manually reviewed decisions. New or changed JP records are upserted into `people_sources`, re-linked via the matching engine, and the denormalized master fields plus `people_statuses` are re-aggregated. Conflicts route to manual review. **Preservation invariants:** locked/manual decisions are never overwritten, keep-separate records stay separate, and existing `master_people` `_id`s are stable across syncs.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as Cron scheduler
    participant JP as Joshua Project API
    participant Sync as Sync worker
    participant PS as people_sources
    participant ME as Matching Engine
    participant MP as master_people / people_statuses
    participant MR as Manual Review queue

    Cron->>Sync: Trigger recurring sync
    Sync->>JP: Fetch JP delta
    JP-->>Sync: Changed / new records
    Sync->>PS: Upsert people_sources (JP)
    Sync->>ME: Re-link new records
    ME-->>Sync: Scores + bands
    alt score >= 90 (auto)
        Sync->>MP: Re-aggregate denormalized fields + status
    else 70-89 (conflict)
        Sync->>MR: Route conflict to manual review
    else below 70
        Sync->>MP: Keep separate (new master if needed)
    end
    Note over MP: Preservation invariants:<br/>locked decisions untouched,<br/>stable master _ids,<br/>keep-separate preserved
```

---

## 5. Merge / matching workflow

The 5-tier engine short-circuits on a Tier 1 cross-reference hit (+100 → auto-merge). Otherwise it accumulates a weighted score across Tiers 2–5, applies penalties, bands the result, and writes a `people_matches` audit record capturing the tier breakdown and final decision.

```mermaid
flowchart TD
    START["Candidate pair"] --> T1{"Tier 1: cross-reference match?"}
    T1 -->|"yes (+100)"| AUTO["AUTO_MERGE"]
    T1 -->|"no"| SCORE["Score Tiers 2-5"]

    SCORE --> ADD["Add: ROP3 +55, internal-id +25,<br/>country +20, name +8/+15, geo +10"]
    ADD --> PEN["Penalties: ROP3-conflict -40,<br/>country-mismatch -15"]
    PEN --> BAND{"Final score band"}

    BAND -->|">= 90"| AUTO
    BAND -->|"70-89"| REVIEW["MANUAL_REVIEW"]
    BAND -->|"< 70"| SEP["KEEP_SEPARATE"]

    AUTO --> AUDIT["Write people_matches audit"]
    REVIEW --> AUDIT
    SEP --> AUDIT
```

---

## 6. Conflict-resolution workflow

Five conflict dimensions — population, location, naming, country, and status — are each routed by policy to one of three outcomes: auto-resolve, preserve-both, or manual-review-then-lock. Locking prevents subsequent syncs from re-triggering the same conflict.

```mermaid
flowchart TD
    CONF["Conflict detected"] --> DIM{"Conflict dimension"}

    DIM -->|"population"| POP["Auto-resolve by policy<br/>(prefer most recent authoritative)"]
    DIM -->|"location"| LOC["Preserve-both<br/>(keep all people_locations)"]
    DIM -->|"naming"| NAME["Preserve-both<br/>(store as people_aliases)"]
    DIM -->|"country"| CTRY["Manual review then lock"]
    DIM -->|"status"| STAT["Auto-resolve by policy<br/>(latest engagement status)"]

    POP --> APPLY["Apply resolution"]
    LOC --> APPLY
    NAME --> APPLY
    STAT --> APPLY
    CTRY --> LOCK["Lock decision"]
    LOCK --> APPLY
    APPLY --> DONE["Update master_people + audit"]
```

---

## 7. Map rendering & source-visibility workflow

`GET /map/markers` returns exactly one GeoJSON feature per master people. The client renders and clusters those features. When a user toggles a source layer, each marker's visibility is computed as the intersection of the master's `sourceTypes[]` with the enabled sources — the marker stays visible as long as **any** of its sources remains enabled. (Example: *Sara Mbai* has both JP and DMM sources; disabling JP alone keeps her marker on the map.)

```mermaid
flowchart TD
    REQ["GET /map/markers"] --> FEAT["One feature per master people<br/>(includes sourceTypes[] + primaryLocation)"]
    FEAT --> RENDER["Client renders + clusters markers"]
    RENDER --> TOGGLE["User toggles source layer"]
    TOGGLE --> CALC["marker.visible =<br/>intersection(sourceTypes, enabledSources).length > 0"]
    CALC --> VIS{"Any source remaining?"}
    VIS -->|"yes"| SHOW["Marker stays visible<br/>(e.g. Sara Mbai: JP off, DMM on)"]
    VIS -->|"no"| HIDE["Marker hidden"]
```

---

## 8. API request flow

A read request flows from the Leaflet client through Express, into Mongoose, and out to MongoDB. Queries hit `master_people` plus its sub-resources, and the response is always shaped as master people records — sub-resources are embedded or joined server-side so clients never reassemble fragments.

```mermaid
sequenceDiagram
    autonumber
    participant Client as Leaflet client
    participant Express as Express
    participant Mongoose as Mongoose
    participant Mongo as MongoDB

    Client->>Express: GET /map/markers (or /people)
    Express->>Mongoose: Build query
    Mongoose->>Mongo: Read master_people + sub-resources
    Mongo-->>Mongoose: Documents (master + people_sources / people_locations / people_statuses)
    Mongoose-->>Express: Hydrated master people
    Express-->>Client: Response (always master people)
```

---

## 9. Deliverables checklist

The table below summarizes the artifacts produced across the series and links to the sibling documents that specify each in detail.

| Artifact | Description | Reference doc |
| --- | --- | --- |
| Data analysis | Source-field inventory across all feeds | [01-data-analysis.md](./01-data-analysis.md) |
| Master people model | Aggregate-root design + denormalized fields | [02-master-people-model.md](./02-master-people-model.md) |
| Merge algorithm | 5-tier scoring, penalties, confidence bands | [03-merge-algorithm.md](./03-merge-algorithm.md) |
| MongoDB schemas + indexes | Six-collection schemas, GeoJSON `2dsphere`, index plan | [04-mongodb-schemas.md](./04-mongodb-schemas.md) |
| Migration workflows | Phases A–G, reconciliation report | [05-migration-workflows.md](./05-migration-workflows.md) |
| Synchronization | Recurring JP sync + preservation invariants | [06-synchronization.md](./06-synchronization.md) |
| Map architecture | Marker model + source-visibility rules | [07-map-architecture.md](./07-map-architecture.md) |
| API architecture | REST endpoints returning master people | [08-api-architecture.md](./08-api-architecture.md) |
| Conflict resolution | Five dimensions → resolve / preserve / lock | [09-conflict-resolution.md](./09-conflict-resolution.md) |
| ER diagram | Six collections + ObjectId relationships | *this document (Section 2)* |
| Migration / sync / merge / conflict / map / API workflow diagrams | Consolidated Mermaid visuals | *this document (Sections 1, 3–8)* |

**Diagram deliverables in this document**

- [x] High-level architecture diagram (Section 1)
- [x] ER diagram of the six MongoDB collections (Section 2)
- [x] Migration workflow, Phases A–G (Section 3)
- [x] Synchronization workflow (Section 4)
- [x] Merge / matching workflow (Section 5)
- [x] Conflict-resolution workflow (Section 6)
- [x] Map rendering & source-visibility workflow (Section 7)
- [x] API request flow (Section 8)
- [x] Deliverables checklist (Section 9)
