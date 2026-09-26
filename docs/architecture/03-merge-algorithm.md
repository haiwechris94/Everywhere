# Step 3 — Merge Algorithm, Confidence Scoring & Pseudocode

The merge engine decides, for any pair of source records, whether they describe the **same ethnic group** and should collapse into one `master_people`. It is **identifier-first** and follows a strict 5-tier priority. **The hard rule: never merge on name alone.**

## 3.1 The 5-Tier Match Priority

| Tier | Signal | Keys used | Authority |
| --- | --- | --- | --- |
| **1** | **Official JP↔CPPI cross-reference** | XLSX `PEID` ↔ `PeopleID3` (+ `ROP3`, `ROG3`/`Ctry`, `Type`) | Authoritative — definitive merge |
| **2** | **Exact identifier match** | `ROP3` first; then `PeopleID3` / `PEID` | Very strong |
| **3** | **Country match** | `ROG3` / `ISOalpha3` (ISO alpha-3) | Necessary constraint, weak alone |
| **4** | **Name similarity** | trigram similarity over names + aliases | **Signal only — never decisive alone** |
| **5** | **Geographic proximity** | PostGIS `ST_DWithin` on `GEOGRAPHY` | Fallback signal |

## 3.2 Confidence Score (0–100)

The score is the **sum of weighted contributions**, capped at 100. Tiers are additive so that corroborating signals reinforce one another, but **name + geo alone cannot reach the auto-merge threshold**.

| Contribution | Condition | Points |
| --- | --- | ---: |
| Cross-reference hit | Pair present in authoritative XLSX | **+100** (definitive) |
| Cross-reference `Type` = exact/strong | XLSX `Type` indicates strong match | (already covered by +100) |
| Exact ROP3 match | Both rows share a non-null `ROP3` | **+55** |
| Exact internal-ID match | `PeopleID3`==`PeopleID3` or `PEID`==`PEID` (within source) | **+25** |
| Country match | Same ISO alpha-3 country | **+20** |
| Name similarity ≥ 0.85 | trigram similarity high | **+15** |
| Name similarity 0.60–0.85 | trigram similarity moderate | **+8** |
| Geographic proximity | within `ST_DWithin` radius (e.g. 25 km) | **+10** |
| Country mismatch | different ISO country | **−15** |
| ROP3 conflict | both have ROP3 but differ | **−40** |

> **Cap:** total score is clamped to `[0, 100]`.

### Confidence bands

| Band | Score | Action |
| --- | --- | --- |
| **Auto-merge** | **90–100** | Merge automatically into one `master_people`. |
| **Manual review** | **70–89** | Queue for a reviewer; do not auto-merge. |
| **Keep separate** | **0–69** | Leave as distinct master records. |

### The hard rule, enforced numerically

The maximum score achievable **without** an identifier or cross-reference is:

```
name(15) + country(20) + geo(10) = 45  →  KEEP SEPARATE
```

A pair therefore **cannot** reach manual-review (70) — let alone auto-merge (90) — on name/country/geo alone. Crossing 90 requires either the **cross-reference (+100)** or **ROP3 (+55)** combined with corroborating signals. This guarantees the business rule **"names alone must NEVER be the primary matching key."**

## 3.3 Pseudocode — Full Matching Pipeline

```text
# ---------- INPUTS ----------
JP        = staged Joshua Project rows        # keyed by PeopleID3, has ROP3, ROG3, name, geo
CPPI      = staged CPPI rows                  # keyed by PEID, has ROP3 (often null), ISOalpha3, name, geo
XREF      = authoritative cross-reference     # rows of (PEID, PeopleID3, ROP3, ROG3, Type, ...)

AUTO_MERGE   = 90
MANUAL_LOW   = 70
PROX_RADIUS  = 25_000   # metres

# ---------- TIER 1: AUTHORITATIVE CROSS-REFERENCE ----------
for xref in XREF:
    jp   = JP.find(PeopleID3 == xref.PeopleID3)
    cppi = CPPI.find(PEID == xref.PEID)
    if jp and cppi:
        master = get_or_create_master(jp, cppi)        # unify under one UUID
        record_mapping(master, jp, cppi,
                       match_type = "CROSS_REFERENCE",
                       tier = 1, confidence = 100,
                       band = "AUTO_MERGE",
                       cross_reference_type = xref.Type)
        mark_consumed(jp); mark_consumed(cppi)

# ---------- TIERS 2–5: SCORE REMAINING PAIRS ----------
# Only compare candidates that share at least one identifier OR same country,
# to keep the candidate set tractable (blocking step).
for cppi in CPPI.not_consumed():
    candidates = blocking_candidates(cppi, JP.not_consumed())
                  # blocks: same ROP3, OR same country, OR within PROX_RADIUS
    best = null
    for jp in candidates:
        score = score_pair(jp, cppi)
        if best is null or score.value > best.value:
            best = score

    if best and best.value >= AUTO_MERGE:
        master = get_or_create_master(jp_of(best), cppi)
        record_mapping(master, jp_of(best), cppi,
                       match_type = best.dominant_tier, tier = best.tier,
                       confidence = best.value, band = "AUTO_MERGE")
        mark_consumed(cppi)
    elif best and best.value >= MANUAL_LOW:
        enqueue_manual_review(cppi, jp_of(best), best.value)   # band = MANUAL_REVIEW
    else:
        create_standalone_master(cppi)                         # band = KEEP_SEPARATE

# Any JP rows never consumed become their own master_people (JP-only).
for jp in JP.not_consumed():
    create_standalone_master(jp)


# ---------- SCORING FUNCTION ----------
function score_pair(jp, cppi):
    s = 0
    dominant_tier = 5

    # Tier 2: exact identifiers
    if jp.ROP3 and cppi.ROP3:
        if jp.ROP3 == cppi.ROP3:
            s += 55; dominant_tier = min(dominant_tier, 2)
        else:
            s -= 40                      # ROP3 conflict — strong negative
    if jp.PeopleID3 == cppi.PeopleID3_via_xref or jp.PEID_equiv == cppi.PEID:
        s += 25; dominant_tier = min(dominant_tier, 2)

    # Tier 3: country
    if iso(jp.ROG3) == iso(cppi.ISOalpha3):
        s += 20; dominant_tier = min(dominant_tier, 3)
    else:
        s -= 15

    # Tier 4: name similarity (SIGNAL ONLY)
    sim = trigram_similarity(best_name(jp), best_name(cppi))   # pg_trgm similarity()
    if sim >= 0.85:       s += 15; dominant_tier = min(dominant_tier, 4)
    elif sim >= 0.60:     s += 8;  dominant_tier = min(dominant_tier, 4)

    # Tier 5: geographic proximity
    if jp.geom and cppi.geom and ST_DWithin(jp.geom, cppi.geom, PROX_RADIUS):
        s += 10; dominant_tier = min(dominant_tier, 5)

    s = clamp(s, 0, 100)
    return { value: s, tier: dominant_tier, dominant_tier: tier_name(dominant_tier) }
```

## 3.4 Worked Scoring Examples

### Example A — Auto-merge via cross-reference (Tier 1)
`Hausa` appears in the XLSX as `PEID 48217 ↔ PeopleID3 12345`, `Type = Exact`.
- Cross-reference hit: **+100**
- **Total = 100 → AUTO_MERGE.** Names are irrelevant to the decision.

### Example B — Auto-merge via ROP3 + corroboration (Tiers 2–4)
No XLSX entry, but both rows have `ROP3 = 109876`, both in `NGA`, names "Hausa" vs "Haoussa" (sim ≈ 0.78).
- ROP3 match: **+55**
- Country match: **+20**
- Name similarity 0.60–0.85: **+8**
- **Total = 83 → MANUAL_REVIEW.** (High, but ROP3+country alone = 75; the moderate name lift keeps it under 90 — a reviewer confirms.)

### Example C — Strong identifiers → auto-merge
Both `ROP3 = 109876`, same country `NGA`, name sim ≥ 0.85.
- ROP3 **+55**, country **+20**, name ≥0.85 **+15** = **90 → AUTO_MERGE.**

### Example D — Name-only near match → keep separate (rule enforced)
No shared ROP3, no XLSX entry, different countries, names "Fula" vs "Fulani" (sim ≈ 0.83).
- Name 0.60–0.85: **+8**
- Country mismatch: **−15** → clamped to **0**
- **Total = 0 → KEEP_SEPARATE.** Name similarity never carries the decision.

### Example E — ROP3 conflict
Both have ROP3 but they differ; same country; high name similarity.
- ROP3 conflict **−40**, country **+20**, name ≥0.85 **+15** → clamped **0**
- **Total = 0 → KEEP_SEPARATE.** A genuine ROP3 disagreement blocks the merge.

## 3.5 Invariants

- **I1.** A pair with a cross-reference entry always auto-merges (Tier 1 dominates).
- **I2.** No merge above 69 is possible without ROP3 or a cross-reference entry.
- **I3.** A ROP3 conflict (`−40`) can never be overcome by name + geo.
- **I4.** Every merge/no-merge decision is written to `source_mappings` with its tier, score, and band for auditability and reversal.
