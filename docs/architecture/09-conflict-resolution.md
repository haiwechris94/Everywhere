# Step 9 — Conflict Resolution Strategy

> **Series context:** This is Step 9 of the MongoDB-first architecture series. It defines what
> happens when two or more sources disagree about the **same** `master_people` record.
> It is invoked by [Step 6 — Joshua Project Synchronization Workflow](./06-synchronization.md)
> during re-aggregation.

## Principles

1. **Lossless first.** Every source's raw values are preserved on their own
   `people_sources` / `people_locations` / `people_aliases` documents. Conflict resolution
   only decides which value the **denormalized master** presents — it never deletes data.
2. **Documented, provenanced winners.** The winning value is recorded in
   `people_statuses.derivedFromSource` so every master field is traceable to a source.
3. **Humans outrank the system.** Any decision made by a reviewer
   (`people_matches.decidedBy != 'system'`) is locked and never auto-overridden by sync.
4. **Confidence bands (Step 3):** `AUTO_MERGE` 90–100, `MANUAL_REVIEW` 70–89,
   `KEEP_SEPARATE` 0–69.

### The six collections (Step 4)

`master_people`, `people_sources`, `people_matches`, `people_aliases`,
`people_locations`, `people_statuses`.

### Keys & authority

- JP keyed on `PeopleID3`; CPPI keyed on `PEID` / `PGID`.
- Cross-reference xlsx (19,375 links) is authoritative **Tier-1**.

---

## 1. Population differences

**Rule (which source wins).** Populations are **lossless**: every source keeps its own
`people_sources.population`. The master's `totalPopulation` is chosen by a documented policy:

- **Default:** *JP-preferred* for JP-linked groups → else *most-recent* (`sourceUpdatedAt`)
  → else *max*.

The winner is recorded in `people_statuses.derivedFromSource`.

**When to preserve both.** Always. Per-source populations are never merged or discarded.

**When to require manual review.** When sources diverge by more than a configurable
percentage (**default 50%**), flag `MANUAL_REVIEW` — but **do not block**: the policy value
is still applied and displayed while the flag is queued.

---

## 2. Location differences

**Rule (which source wins).** Preserve **all** points in `people_locations`. Exactly one is
`isPrimary`, chosen by priority:

1. **JP geo preferred** — JP has ~13 missing coordinates vs CPPI ~3,088 missing, so JP is the
   more complete geo source.
2. then **most-complete** point (has lat/lng/country),
3. then **most-recent**.

**When to preserve both.** Always — every point is kept regardless of the primary choice.

**When to require manual review.** If two authoritative points are far apart
(**> threshold, default 100 km**) within the **same country**, flag `MANUAL_REVIEW` to decide
which is primary. Both points remain stored either way.

---

## 3. Naming differences

**Rule (which source wins).** Names are **signal only** — never a merge blocker. Every variant
is kept in `people_aliases`. The master `canonicalName` is chosen by the Step-2 priority order:

1. JP `PeopNameAcrossCountries`
2. CPPI `NmDisp`
3. JP `PeopNameInCountry`
4. CPPI `Name`

**When to preserve both.** Always — all variants stay in `people_aliases`.

**When to require manual review.** Never for names alone. Differing names do not lower
confidence and do not trigger review.

---

## 4. Country differences

**Rule (which source wins).** A people group can legitimately **span countries** (per-country
source rows). Preserve per-country data in `people_sources` / `people_locations`. The master's
`primaryCountryCode` = the **largest-population country**.

**When to preserve both.** Always — per-country rows are retained. A cross-reference / `ROP3`
link across **different** countries is allowed (a multi-country ethnic group is normal).

**When to require manual review.** A country **mismatch with no `ROP3`/xref support** lowers
match confidence (**−15 per Step 3**) and tends toward `KEEP_SEPARATE`. If the resulting score
lands in the 70–89 band, it is queued for `MANUAL_REVIEW`.

---

## 5. Status differences (reached / engagement)

**Rule (which source wins).** The master headline status is derived by **source priority per
dimension**:

- **Reached-status** (`JPScale`, `LeastReached`, `Frontier`): **JP authoritative**.
- **On-the-ground engagement / church data** (movements, church counts): **DMM / Survey
  authoritative**.

All raw statuses stay in `people_sources`; the winner per dimension is recorded in
`people_statuses.derivedFromSource`.

**When to preserve both.** Always. A contradiction between JP "reached" and DMM
"active movement" is expected and **both are surfaced** in the API / map popup.

**When to require manual review.** No auto-override on contradiction — surface both. Escalate
to review only when a reviewer explicitly requests reconciliation; sync never forces one status
to win over the other across dimensions.

---

## Resolution decision table

| Dimension | Winner policy | Preserve both? | Manual-review trigger |
| --- | --- | --- | --- |
| Population | JP-preferred → most-recent → max | Yes (all per-source) | Divergence > 50% (flag, non-blocking) |
| Location | JP geo → most-complete → most-recent | Yes (all points) | Two authoritative points > 100 km apart, same country |
| Naming | JP `PeopNameAcrossCountries` → CPPI `NmDisp` → JP `PeopNameInCountry` → CPPI `Name` | Yes (all aliases) | Never (names are signal only) |
| Country | `primaryCountryCode` = largest-population country | Yes (per-country rows) | Country mismatch with no ROP3/xref (−15 → 70–89 band) |
| Status | JP for reached-status; DMM/Survey for engagement | Yes (surface both) | Reviewer-requested reconciliation only |

---

## Manual review workflow

1. A conflict that requires a human is written to `people_matches` with band
   `MANUAL_REVIEW` (score 70–89), including the reason and the affected `masterId`.
2. A reviewer resolves it. Their decision writes `people_matches.decidedBy = <user>` and the
   resolved outcome (attach / keep-separate / chosen primary / chosen status).
3. Once decided by a human, the mapping/decision is **LOCKED**. Per the Step 6 preservation
   invariants, sync will only update source-owned fields afterward — it will never revert or
   re-score a human decision.

---

## Reversibility

- Every resolution — automatic or manual — is an auditable row in `people_matches` with its
  score, band, `decidedBy`, reason, and `syncRunId`.
- Because raw source data is never destroyed (lossless preservation), any decision can be
  **re-opened**. If a newer authoritative cross-reference (Tier-1 xref) arrives that changes
  the picture, the affected match is re-queued to `MANUAL_REVIEW` and the master can be
  re-aggregated without data loss.

## Related

- [Step 6 — Joshua Project Synchronization Workflow](./06-synchronization.md) — invokes these
  rules during re-aggregation and enforces the preservation invariants.
