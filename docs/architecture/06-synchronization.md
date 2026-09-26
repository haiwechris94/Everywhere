# Step 6 — Joshua Project Synchronization Workflow

> **Series context:** This is Step 6 of the MongoDB-first architecture series. It builds on
> the six collections defined in Step 4 and the confidence bands defined in Step 3.
> Conflict outcomes are delegated to [Step 9 — Conflict Resolution Strategy](./09-conflict-resolution.md).

## Purpose

Keep Joshua Project (JP) source data fresh **without destroying** any of the following:

- `master_people` identity records,
- manual merges made by humans,
- approved source-to-master mappings.

The sync process is **additive and non-destructive by default**. JP is only ever allowed to
own and update *its own* `people_sources` documents. It is never allowed to rewrite master
identity, another source's data, or a human decision.

## The six collections (Step 4 recap)

| Collection | Role in sync |
| --- | --- |
| `master_people` | Canonical, stable identity per people group. Denormalized/aggregated fields recomputed after each sync. |
| `people_sources` | One document per (sourceType, sourceRecordId). JP owns rows where `sourceType='JP'` keyed on `sourceRecordId = PeopleID3`. |
| `people_matches` | Audit log of every link/merge decision, with confidence band and `decidedBy`. |
| `people_aliases` | Every name variant from every source (see Step 9 naming rules). |
| `people_locations` | Every geo point from every source; one `isPrimary`. |
| `people_statuses` | Derived headline status per master, with `derivedFromSource` provenance. |

### Keys and authority

- **JP** records are keyed on `PeopleID3`.
- **CPPI** records are keyed on `PEID` / `PGID`.
- The **cross-reference xlsx (19,375 links)** is the authoritative **Tier-1** matcher.
- JP data enters the system through `backend/services/joshuaProjectService.js`
  (raw API client) and `backend/services/joshuaProjectSync.js` (orchestration described here).

## Confidence bands (Step 3 recap)

| Band | Range | Behavior |
| --- | --- | --- |
| `AUTO_MERGE` | 90–100 | Auto-attach to existing master. |
| `MANUAL_REVIEW` | 70–89 | Attach deferred; queued for a human. |
| `KEEP_SEPARATE` | 0–69 | Create/keep a standalone master. |

## Sync algorithm (numbered)

1. **Acquire lock.** Take a global sync lock (`sync_locks`) keyed by scope; abort if another
   run holds it. This prevents concurrent syncs from racing on the same masters.
2. **Open a sync run.** Create a `syncRunId` (uuid) and `version` tag; record `startedAt`,
   scope (country or delta), and `dryRun` flag.
3. **Fetch JP people.** Via `joshuaProjectService`, fetch either a full country slice or a
   delta window (records with `PeopleID3` updated since the last successful run).
4. **Upsert sources.** For each JP record, upsert the `people_sources` doc keyed on
   `(sourceType='JP', sourceRecordId=PeopleID3)`. Update **only source-owned fields**:
   `population`, `JPScale`, `names`, `geo`, `rawAttributes`, and `sourceUpdatedAt`.
   Never touch `masterId` on an already-linked doc, never touch `master_people`,
   never touch another source's doc.
5. **Re-link new records.** For any JP `PeopleID3` not yet attached to a master, run the
   matching engine (Tier 1 cross-reference first, then Tiers 2–5). Write a `people_matches`
   audit row and either attach to an existing `master_people` (band `AUTO_MERGE`), queue it
   (`MANUAL_REVIEW`), or create a standalone `master_people` (`KEEP_SEPARATE`).
6. **Detect conflicts.** For linked records where new JP values differ from the current
   denormalized/aggregated values on the master, do **not** auto-apply changes that would
   override a human grouping. Defer to Step 9. A changed `ROP3` (possible re-classification)
   that conflicts with an approved/manual grouping is flagged `MANUAL_REVIEW` — never
   auto-moved.
7. **Re-aggregate.** For each touched master, recompute denormalized fields
   (`sourceTypes[]`, `totalPopulation`, `primaryLocation`, embedded status summary) and
   refresh `people_statuses` with provenance.
8. **Soft-handle retirements.** JP records that disappeared from the JP API are marked
   `stale`/`inactive` on their `people_sources` doc. History is preserved; nothing that a
   master depends on is hard-deleted.
9. **Emit report & release lock.** Record counts, conflicts flagged, masters created,
   masters updated, errors. Persist `finishedAt` on the sync run and release the lock.

## Mongoose pseudocode — upsert + re-link + re-aggregate loop

```js
// backend/services/joshuaProjectSync.js (pseudocode)
async function runJpSync({ scope, dryRun = false } = {}) {
  const lock = await SyncLock.acquire('jp-sync', { scope });
  if (!lock) throw new Error('JP sync already running');

  const syncRunId = uuid();
  const version = `jp-${new Date().toISOString()}`;
  const report = { syncRunId, version, upserted: 0, created: 0, flagged: 0, retired: 0 };

  try {
    const jpRecords = await joshuaProjectService.fetchPeople(scope); // country or delta

    for (const jp of jpRecords) {
      // 1) Upsert source-owned fields ONLY — never master, never other sources.
      const sourceUpdate = {
        $set: {
          sourceType: 'JP',
          sourceRecordId: jp.PeopleID3,
          population: jp.Population,
          JPScale: jp.JPScale,
          names: {
            acrossCountries: jp.PeopNameAcrossCountries,
            inCountry: jp.PeopNameInCountry,
          },
          geo: { lat: jp.Latitude, lng: jp.Longitude, countryCode: jp.ROG3 },
          rop3: jp.ROP3,
          rawAttributes: jp,
          sourceUpdatedAt: new Date(),
          syncRunId,
          stale: false,
        },
      };

      if (dryRun) { report.upserted++; continue; }

      const source = await PeopleSource.findOneAndUpdate(
        { sourceType: 'JP', sourceRecordId: jp.PeopleID3 },
        sourceUpdate,
        { upsert: true, new: true }
      );
      report.upserted++;

      // 2) Re-link if this JP record is not yet attached to a master.
      if (!source.masterId) {
        const match = await matchingEngine.match(source); // Tier 1 xref, then Tiers 2-5
        await PeopleMatch.create({
          sourceId: source._id,
          candidateMasterId: match.masterId || null,
          score: match.score,
          band: match.band,           // AUTO_MERGE | MANUAL_REVIEW | KEEP_SEPARATE
          decidedBy: 'system',
          syncRunId,
        });

        if (match.band === 'AUTO_MERGE' && match.masterId) {
          source.masterId = match.masterId;                 // attach
        } else if (match.band === 'KEEP_SEPARATE') {
          const master = await MasterPeople.create({ createdBy: 'system' });
          source.masterId = master._id;                     // standalone
          report.created++;
        } else {
          report.flagged++;                                 // MANUAL_REVIEW: leave detached
        }
        await source.save();
      } else {
        // 3) Already linked: detect conflicts, DO NOT auto-override human groupings.
        const conflict = await detectConflicts(source); // ROP3 change, population, etc.
        if (conflict?.affectsApprovedGrouping) {
          await PeopleMatch.create({
            sourceId: source._id,
            candidateMasterId: source.masterId,
            band: 'MANUAL_REVIEW',
            reason: conflict.reason, // e.g. 'ROP3 re-classification'
            decidedBy: 'system',
            syncRunId,
          });
          report.flagged++;
          continue; // defer to Step 9; do not mutate the grouping
        }
      }

      // 4) Re-aggregate the affected master from ALL its sources.
      if (source.masterId) await reaggregateMaster(source.masterId, { syncRunId });
    }

    // 5) Soft-retire JP sources absent from this full-scope pull.
    if (scope.full && !dryRun) {
      const res = await PeopleSource.updateMany(
        { sourceType: 'JP', syncRunId: { $ne: syncRunId } },
        { $set: { stale: true, inactiveAt: new Date() } } // never hard-delete
      );
      report.retired = res.modifiedCount;
    }

    return report;
  } finally {
    await lock.release();
  }
}

// Recompute denormalized master fields + refresh people_statuses.
async function reaggregateMaster(masterId, { syncRunId }) {
  const sources = await PeopleSource.find({ masterId, stale: { $ne: true } });

  const sourceTypes = [...new Set(sources.map(s => s.sourceType))];
  const totalPopulation = resolvePopulation(sources);       // Step 9 population policy
  const primaryLocation = resolvePrimaryLocation(sources);  // Step 9 location policy
  const statusSummary = resolveStatus(sources);             // Step 9 status policy

  await MasterPeople.updateOne(
    { _id: masterId },
    { $set: { sourceTypes, totalPopulation, primaryLocation, statusSummary,
              aggregatedAt: new Date(), aggregatedByRun: syncRunId } }
  );

  await PeopleStatus.findOneAndUpdate(
    { masterId },
    { $set: { headline: statusSummary.headline,
              derivedFromSource: statusSummary.winnerSource,
              updatedAt: new Date() } },
    { upsert: true }
  );
}
```

## How a JP field change propagates to the master

1. JP API reports a new `Population` for `PeopleID3`.
2. Step 4 (upsert) writes it to that JP `people_sources` doc **only**.
3. Re-aggregation reads **all** sources for the master and applies the Step 9 population
   policy (JP-preferred for JP-linked groups) to recompute `master_people.totalPopulation`.
4. `people_statuses.derivedFromSource` records which source won, so the change is provenanced
   and reversible. The raw per-source populations remain untouched (lossless).

## Preservation invariants

1. **Stable identity.** `master_people._id` never changes during sync; JP can never
   create, delete, or re-key a master identity implicitly.
2. **Manual merges are sacred.** Any `people_matches` decision where `decidedBy != 'system'`
   is never auto-reverted, re-scored away, or overridden by a later sync.
3. **Approved mappings are locked.** Once a source→master mapping is approved, sync updates
   only the source's own fields; it cannot re-point the mapping.
4. **Source-scoped writes only.** JP sync updates only JP-owned `people_sources` fields plus
   `sourceUpdatedAt`. It never writes another source's doc or master identity fields.
5. **No hard deletes.** Retired JP records are marked `stale`/`inactive`; history is kept.
6. **Conflicts defer, never destroy.** Any conflict with an approved/manual grouping is
   routed to `MANUAL_REVIEW` (Step 9) rather than applied automatically.

## Scheduling & safety

- **Cron cadence.** Nightly delta sync (records changed since last successful run) plus a
  weekly full country-by-country reconciliation. Deltas are cheap; the weekly full pass is
  what detects retirements.
- **Locking.** A `sync_locks` row (or a distributed lock) prevents concurrent JP syncs from
  racing on the same masters. A second invocation aborts immediately rather than queueing.
- **Dry-run mode.** `runJpSync({ dryRun: true })` fetches and evaluates matches/conflicts and
  emits the same report **without writing** any documents. Used to preview a large country
  import before committing.
- **Sync run id / version tag.** Every write carries `syncRunId` and a `version` tag so a run
  is fully attributable and its writes can be filtered, audited, or (for soft-retire) reversed.
- **Metrics / report emitted.** Each run emits: records fetched, sources upserted, masters
  created, masters updated, conflicts flagged (`MANUAL_REVIEW`), records soft-retired,
  errors, and wall-clock duration. Alert if `flagged` or `errors` exceed configured thresholds.

## Related

- [Step 9 — Conflict Resolution Strategy](./09-conflict-resolution.md) — the rules invoked
  whenever a synced JP value disagrees with the current aggregated master.
