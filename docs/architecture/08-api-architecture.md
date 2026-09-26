# Step 8 — REST API Architecture

> Part of the MongoDB-first architecture series. Built on the six collections
> from **Step 4**: `master_people`, `people_sources`, `people_matches`,
> `people_aliases`, `people_locations`, `people_statuses`.
>
> **Stack:** Express + Mongoose + MongoDB (2dsphere geo) · React-Leaflet frontend.

---

## 1. Guiding principle

> The API **ALWAYS returns master people** (canonical entities). It **never**
> exposes raw per-source rows as top-level entities.

Sources are a **facet** of a master people, not an entity in their own right in
the public API. They are reached only through **sub-resources**
(`/people/:id/sources`, `/aliases`, `/status`, `/location`). This guarantees the
"one master people = one marker / one row" invariant established in Step 7.

---

## 2. Conventions

### 2.1 Standard response envelope

Single resource:

```json
{ "data": { /* master people object */ } }
```

Collection (with pagination):

```json
{
  "data": [ /* array of resources */ ],
  "meta": { "page": 1, "limit": 25, "total": 1842, "totalPages": 74 }
}
```

### 2.2 Error format

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "master people 665f... not found",
    "details": null
  }
}
```

Common codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404),
`INTERNAL_ERROR` (500).

### 2.3 Pagination convention

- `page` (1-based, default `1`) and `limit` (default `25`, max `200`).
- `meta.total` is the unfiltered-by-page count for the current filter set;
  `meta.totalPages = ceil(total / limit)`.

### 2.4 Filtering by source is a facet

Filtering with `?source=JP` returns the **master people** that have `JP` in their
`sourceTypes[]` — it does **not** return JP source rows. The source is a filter
facet, never a separate returned entity.

---

## 3. Endpoints

### GET /people

List master people (canonical summaries).

- **Purpose:** paginated, filterable, sortable list for tables and search.
- **Query params:** `page`, `limit`, `status`, `country`, `source` (repeatable),
  `q` (name search over `people_aliases` text index + `canonicalName`), `sort`
  (e.g. `canonicalName`, `-updatedAt`).

```json
{
  "data": [
    {
      "id": "665f1a2b3c4d5e6f7a8b9c0d",
      "canonicalName": "Sara Mbai",
      "primaryCountryCode": "KE",
      "status": "engaged",
      "sourceTypes": ["JP", "PeopleGroups", "DMM"],
      "primaryLocation": { "type": "Point", "coordinates": [36.8219, -1.2921] }
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 1842, "totalPages": 74 }
}
```

---

### GET /people/:id

One master people — the full canonical document.

- **Purpose:** detail view; includes denormalized `sourceTypes`,
  `primaryLocation`, and embedded `status`.

```json
{
  "data": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "canonicalName": "Sara Mbai",
    "primaryCountryCode": "KE",
    "sourceTypes": ["JP", "PeopleGroups", "DMM"],
    "primaryLocation": { "type": "Point", "coordinates": [36.8219, -1.2921] },
    "status": { "value": "engaged", "derivedFrom": "DMM", "confidence": 0.82 },
    "createdAt": "2025-01-04T10:15:00Z",
    "updatedAt": "2025-02-11T08:02:00Z"
  }
}
```

---

### GET /people/:id/sources

The `people_sources` array for this master — the **lossless per-source view**.

- **Purpose:** power the popup source breakdown and audit/debug reconciliation.

```json
{
  "data": [
    {
      "sourceType": "JP",
      "sourceRecordId": "12345",
      "name": "Sara",
      "population": 480000,
      "status": "engaged",
      "rawAttributes": { "jpScale": "2", "primaryReligion": "Islam" }
    },
    {
      "sourceType": "PeopleGroups",
      "sourceRecordId": "cppi-8891",
      "name": "Sara Mbai",
      "population": 495120,
      "status": "engaged",
      "rawAttributes": { "region": "Coast" }
    },
    {
      "sourceType": "DMM",
      "sourceRecordId": "dmm-77",
      "name": "Sara-Mbai",
      "population": null,
      "status": "movement",
      "rawAttributes": { "generations": 4 }
    }
  ]
}
```

---

### GET /people/:id/aliases

The `people_aliases` list.

- **Purpose:** show alternate names; backs the search text index.

```json
{
  "data": [
    { "alias": "Sara",      "aliasType": "variant",     "sourceType": "JP",           "languageCode": "en" },
    { "alias": "Sara Mbai", "aliasType": "canonical",   "sourceType": "PeopleGroups", "languageCode": "en" },
    { "alias": "Sara-Mbai", "aliasType": "spelling",    "sourceType": "DMM",          "languageCode": "sw" }
  ]
}
```

---

### GET /people/:id/status

The aggregated `people_statuses` document + which source it derived from.

```json
{
  "data": {
    "value": "engaged",
    "derivedFrom": "DMM",
    "confidence": 0.82,
    "history": [
      { "value": "unengaged", "sourceType": "JP",  "at": "2024-11-01T00:00:00Z" },
      { "value": "engaged",   "sourceType": "DMM", "at": "2025-02-10T00:00:00Z" }
    ]
  }
}
```

---

### GET /people/:id/location

The `people_locations` list + which one is primary.

```json
{
  "data": [
    {
      "location": { "type": "Point", "coordinates": [36.8219, -1.2921] },
      "sourceType": "PeopleGroups",
      "isPrimary": true,
      "label": "Nairobi cluster"
    },
    {
      "location": { "type": "Point", "coordinates": [39.6682, -4.0435] },
      "sourceType": "JP",
      "isPrimary": false,
      "label": "Mombasa"
    }
  ]
}
```

---

### GET /map/markers

One GeoJSON `FeatureCollection`, **one feature per master people**.

- **Purpose:** feed the Leaflet map (see Step 7).
- **Query params:** `bbox=minLng,minLat,maxLng,maxLat`, `zoom`, `status`,
  `country`, `source` (repeatable).

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [36.8219, -1.2921] },
      "properties": {
        "id": "665f1a2b3c4d5e6f7a8b9c0d",
        "canonicalName": "Sara Mbai",
        "primaryCountryCode": "KE",
        "status": "engaged",
        "sourceTypes": ["JP", "PeopleGroups", "DMM"]
      }
    }
  ]
}
```

---

### GET /map/statistics

Aggregated counts by `status`, `country`, and `sourceType` over `master_people`
(each master counted once for status/country — see Step 7 §7).

```json
{
  "data": {
    "totals": { "masterPeople": 1842 },
    "byStatus":  { "unengaged": 900, "engaged": 742, "movement": 200 },
    "byCountry": { "KE": 640, "TZ": 512, "UG": 690 },
    "bySourceType": { "JP": 1500, "PeopleGroups": 1100, "DMM": 320 }
  }
}
```

---

## 4. Backwards compatibility

The existing routes `backend/routes/peopleGroups.js` (`/peopleGroups`) and
`backend/routes/joshuaProject.js` (`/joshua-project`) currently return raw
per-source rows. During migration:

- **Keep legacy routes as thin adapters.** They stay mounted but internally query
  the new master-people model and shape the response to their old contract.
- `/peopleGroups` → resolves masters that have `sourceTypes` containing
  `PeopleGroups`, then projects each master's PeopleGroups source row (from
  `GET /people/:id/sources` logic) into the legacy shape.
- `/joshua-project` → same pattern, filtered to `sourceType: 'JP'`.
- Both adapters set a deprecation header, e.g.
  `Deprecation: true` + `Link: </people>; rel="successor-version"`.
- Once frontend fully consumes `/people` and `/map/*`, the adapters can be
  removed. No source data is lost — everything remains in `people_sources`.

---

## 5. Express route sketch (Mongoose)

```js
const express = require('express');
const router = express.Router();
const MasterPeople = require('../models/MasterPeople');
const PeopleAlias = require('../models/PeopleAlias');

// GET /people — paginated, filterable list of master people
router.get('/people', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Number(req.query.limit) || 25);
    const { status, country, q, sort } = req.query;
    const sources = [].concat(req.query.source || []);

    const filter = {};
    if (status)         filter.status = status;
    if (country)        filter.primaryCountryCode = country;
    if (sources.length) filter.sourceTypes = { $in: sources };

    if (q) {
      // search aliases (text index) -> master ids, plus canonicalName regex
      const aliasHits = await PeopleAlias.find(
        { $text: { $search: q } },
        { masterPeopleId: 1 }
      ).lean();
      const ids = aliasHits.map((a) => a.masterPeopleId);
      filter.$or = [
        { _id: { $in: ids } },
        { canonicalName: { $regex: q, $options: 'i' } }
      ];
    }

    const projection = {
      canonicalName: 1, primaryCountryCode: 1,
      status: 1, sourceTypes: 1, primaryLocation: 1
    };

    const [docs, total] = await Promise.all([
      MasterPeople.find(filter, projection)
        .sort(sort || 'canonicalName')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MasterPeople.countDocuments(filter)
    ]);

    res.json({
      data: docs.map((d) => ({ id: String(d._id), ...d, _id: undefined })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
});

// GET /map/markers — one GeoJSON feature per master people (2dsphere bbox)
router.get('/map/markers', async (req, res, next) => {
  try {
    const { bbox, zoom, status, country } = req.query;
    const sources = [].concat(req.query.source || []);
    const filter = {};

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
      filter.primaryLocation = {
        $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] }
      };
    }
    if (status)         filter.status = status;
    if (country)        filter.primaryCountryCode = country;
    if (sources.length) filter.sourceTypes = { $in: sources };

    const limit = Number(zoom) < 7 ? 2000 : 20000;

    const docs = await MasterPeople.find(filter)
      .select({
        canonicalName: 1, primaryCountryCode: 1,
        status: 1, sourceTypes: 1, primaryLocation: 1
      })
      .limit(limit)
      .lean();

    res.json({
      type: 'FeatureCollection',
      features: docs.map((d) => ({
        type: 'Feature',
        geometry: d.primaryLocation,
        properties: {
          id: String(d._id),
          canonicalName: d.canonicalName,
          primaryCountryCode: d.primaryCountryCode,
          status: d.status,
          sourceTypes: d.sourceTypes
        }
      }))
    });
  } catch (err) { next(err); }
});

module.exports = router;
```

---

## 6. Endpoint summary table

| Method | Path                    | Returns                                             | Key params                                      |
| ------ | ----------------------- | --------------------------------------------------- | ----------------------------------------------- |
| GET    | `/people`               | Paginated list of master people summaries           | `page`, `limit`, `status`, `country`, `source`, `q`, `sort` |
| GET    | `/people/:id`           | One full canonical master people                     | —                                               |
| GET    | `/people/:id/sources`   | `people_sources` array (lossless per-source view)    | —                                               |
| GET    | `/people/:id/aliases`   | `people_aliases` list                                | —                                               |
| GET    | `/people/:id/status`    | Aggregated `people_statuses` doc + derivedFrom       | —                                               |
| GET    | `/people/:id/location`  | `people_locations` list + which is primary           | —                                               |
| GET    | `/map/markers`          | GeoJSON `FeatureCollection`, one feature per master  | `bbox`, `zoom`, `status`, `country`, `source`   |
| GET    | `/map/statistics`       | Aggregated counts by status / country / sourceType   | `status`, `country`, `source`                   |
