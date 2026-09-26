# Step 1 — Data Analysis (Real Statistics)

This analysis uses **only the measured statistics** from the three source artifacts. No record counts are invented.

## 1.1 Sources Overview

| Source | File | Delimiter | Header | Grain |
| --- | --- | --- | --- | --- |
| Joshua Project (JP) | `backend/data/AllPeoplesInCountry.csv` | `;` | Line 3 (2-line preamble) | One row per **people-group-in-country** |
| IMB / PeopleGroups.org (CPPI) | `backend/data/people_groups.csv` | `;` | Line 1 | One row per people-group entry |
| JP↔CPPI Cross-Reference | `backend/data/jp-cppi-cross-reference.xlsx` | — (XLSX) | Row 1 | One row per authoritative JP↔CPPI link |

## 1.2 Identifiers Available per Source

| Source | Primary internal ID(s) | Registry of Peoples IDs | Country IDs | Language IDs |
| --- | --- | --- | --- | --- |
| JP | `PeopleID3` (unique per people-in-country), `PeopleID1`, `PeopleID2` | `ROP3`, `ROP2`, `ROP1` | `ROG3`, `ROG2`, `Ctry` | `ROL3`, `ROL2` |
| CPPI | `PEID` (internal), `PGID` (e.g. `PG024371`), `OBJECTID` | `ROP3`, `ROP25`, `ROP2`, `ROP1` | `ISOalpha3`, `ROG`, `Ctry` | `ROL` |
| Cross-Reference | `PEID` ↔ `PeopleID3` | `ROP3` | `ROG3`, `Ctry` | (JP* / CPPI* parallel columns) |

**Naming conventions.** JP exposes `PeopNameAcrossCountries` and `PeopNameInCountry`; CPPI exposes `Name`, `NmDisp` (display), `NmAlt` (alternate), and `PplNm`. These naming columns differ in spelling, casing, diacritics, and language across sources, which is exactly why **names are treated as a contributing signal only** (see Step 3).

## 1.3 Source → Statistics Table

| Source | Data rows | Unique ROP3 | Unique internal ID | Missing ROP3 | Missing geo | Duplicate (country, ROP3) keys |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Joshua Project (JP) | 16,449 | 10,424 | 10,432 (`PeopleID3`) | 25 | 13 | 2 |
| CPPI (IMB / PeopleGroups.org) | 12,376 | 6,281 | — | 3,086 | 3,088 | 84 |
| Cross-Reference (authoritative) | 19,375 | — | — | — | — | — |

### Notes on the statistics

- **JP grain.** 16,449 data rows are people-group-**in-country** records. `PeopleID3` is unique per people-in-country (10,432 distinct). `ROP3` groups the same ethnic group **across** countries, yielding **10,424 distinct ethnic groups**. The small gap (10,432 vs 10,424) plus the 2 duplicate `(country, ROP3)` keys and 25 missing `ROP3` reflect a handful of rows that cannot be keyed cleanly on `ROP3` alone.
- **CPPI data quality.** Of 12,376 rows, **3,086 (~24.9%) are missing `ROP3`** and **3,088 (~24.9%) are missing geo**. There are **84 duplicate `(country, ROP3)` keys**, indicating CPPI requires more cleansing than JP.
- **Cross-reference coverage.** The authoritative XLSX has **19,375 data rows**, each linking a CPPI `PEID` to a JP `PeopleID3` via `ROP3` + `ROG3`/`Ctry`, carrying a `Type` (match type) column and parallel `JP*` / `CPPI*` attribute columns. This is the Priority-1 matching source and covers more rows than either source's unique-ROP3 count because links are made at the per-country grain.

## 1.4 Direct Overlap (computed on ROP3 from the two source CSVs)

| Segment | ROP3 count |
| --- | ---: |
| Shared ROP3 (appear in **both** JP and CPPI) | 5,317 |
| JP-only ROP3 | 5,107 |
| CPPI-only ROP3 | 964 |

> Sanity check: 5,317 shared + 5,107 JP-only = 10,424 JP unique ROP3. 5,317 shared + 964 CPPI-only = 6,281 CPPI unique ROP3. Both reconcile with §1.3.

## 1.5 JP ↔ CPPI Relationship Quality

- **Authoritative coverage is strong.** With 19,375 cross-reference rows, the official mapping is the dominant linking mechanism and supersedes heuristic matching.
- **ROP3 is the best shared natural key**, but it is **not complete on the CPPI side** (3,086 missing). ROP3-based matching alone cannot cover CPPI rows lacking `ROP3`.
- **Geo completeness** is high in JP (only 13 missing) but moderate in CPPI (3,088 missing), so geographic proximity is a **fallback signal**, not a primary key.
- **Duplicates** exist in both sources (JP: 2, CPPI: 84) on `(country, ROP3)`, so the pipeline must de-duplicate per `(country, ROP3)` during staging.

## 1.6 Merge Projections

These projections are **estimates derived from the measured numbers**; exact final counts will be produced by the loader's reconciliation report (Step 5).

| Outcome | Basis | Estimated scale |
| --- | --- | --- |
| **Auto-merge (90–100)** | Driven primarily by the **19,375 authoritative cross-reference mappings**, reinforced by the **5,317 shared ROP3** between source files. | The large majority of CPPI rows that have a cross-reference entry merge automatically into JP master records. |
| **Manual review (70–89)** | The **~3,086 CPPI rows lacking ROP3** that also lack a cross-reference entry, plus the **84 CPPI** and **2 JP** duplicate `(country, ROP3)` keys, and any name-only near-matches. | Up to ~3,000+ candidates, dominated by ROP3-missing CPPI rows. |
| **Keep separate (0–69)** | **5,107 JP-only ROP3** and **964 CPPI-only ROP3** that the cross-reference does **not** link. Each remains its own master people unless a cross-reference or strong identifier link is found. | ~5,107 JP-only + up to ~964 CPPI-only standalone master records. |

### Reasoning

1. **Cross-reference first.** Because the XLSX is authoritative and covers 19,375 mappings, any CPPI↔JP pair present there is an automatic merge (Tier 1), regardless of name differences.
2. **Shared ROP3 reinforces.** The 5,317 shared ROP3 confirm a strong overlap; rows with matching ROP3 **and** matching country score in the auto-merge band even without an XLSX entry.
3. **Missing ROP3 → manual review.** The ~3,086 CPPI rows without ROP3 cannot be keyed automatically; if no cross-reference entry exists they fall to identifier-absent matching (country + name + proximity) which, by rule, cannot exceed the auto-merge threshold on name alone — pushing them to the 70–89 review band.
4. **Unlinked uniques → keep separate.** 5,107 JP-only and 964 CPPI-only ROP3 that the cross-reference does not connect are most likely genuinely distinct ethnic groups (or not-yet-mapped) and should remain separate master records until evidence links them.

## 1.7 Stated Assumptions

- **A1.** The cross-reference XLSX is current and authoritative; its `Type` column encodes match quality and is trusted over heuristics.
- **A2.** `ROP3` is the canonical cross-source natural key when present; absence of `ROP3` is treated as a data-quality gap, not a "no people group" signal.
- **A3.** Per-country grain is preserved as `people_sources` rows; the ethnic-group rollup happens at `master_people` via ROP3 / cross-reference, not by collapsing countries.
- **A4.** Duplicate `(country, ROP3)` keys are de-duplicated in staging by keeping the most recently updated / most complete row and recording the rest as aliases.
- **A5.** Missing geo does not block merging; a master people may have zero, one, or many coordinates.
- **A6.** "Keep separate" is reversible — a future cross-reference update can re-merge previously separate records (see conflict-resolution workflow, Step 8).
