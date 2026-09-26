# Step 7 — Map Architecture (One Master People = One Marker)

> Part of the MongoDB-first architecture series. Anchored on the six collections
> defined in **Step 4**: `master_people`, `people_sources`, `people_matches`,
> `people_aliases`, `people_locations`, `people_statuses`.
>
> **Stack:** Express + Mongoose + MongoDB (2dsphere geo) · React-Leaflet with
> marker clustering.

---

## 1. Problem statement

Today the map is populated from raw source data. When Joshua Project (JP) and
the CPPI/PeopleGroups importer both describe the *same* people group, each import
produces its **own marker**. The result:

- The same people group appears **two or more times** on the map.
- Statistics double-count the same real-world group once per source.
- Toggling a data source is meaningless — there is no shared identity binding the
  duplicates together.

**New requirement:** **ONE master people = ONE map marker**, regardless of how
many sources (JP, CPPI/PeopleGroups, DMM, …) describe it.

This is made possible because `master_people` is **denormalized** (see Step 4):

| Field             | Purpose                                                         |
| ----------------- | --------------------------------------------------------------- |
| `sourceTypes[]`   | Which sources contribute to this master, e.g. `['JP','CPPI','DMM']` |
| `primaryLocation` | Embedded **GeoJSON Point** used to place the single marker      |
| `status` (summary)| Embedded aggregated status so no join is needed to color a pin  |
| `canonicalName`   | Display name for the marker/popup                               |
| `primaryCountryCode` | Country facet for filtering                                  |

Because these fields live **on the master document**, a marker can be rendered
from `master_people` **alone** — no fan-out reads across source collections.

---

## 2. Marker generation

Markers come from `master_people.primaryLocation`. The endpoint
`GET /map/markers` returns **one GeoJSON feature per master people**:

```json
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
```

Key points:

- **Single-collection read.** We read only `master_people`, never joining out to
  `people_sources`/`people_locations` for the map view.
- **Denormalized fields** (`primaryLocation`, `status`, `sourceTypes`,
  `primaryCountryCode`, `canonicalName`) supply everything the marker needs.
- **Performance:** use Mongoose `.lean()` (plain JS objects, no hydration) plus a
  **projection** limited to the marker fields. This keeps payloads small and
  avoids Mongoose document overhead for potentially tens of thousands of pins.

> Note `coordinates` are `[lng, lat]` per GeoJSON. Leaflet expects `[lat, lng]`;
> convert on the client when building `L.latLng`.

---

## 3. Clustering

Rendering N markers directly is expensive once N grows. Two complementary
strategies:

### 3.1 Client-side clustering (default)

Use Leaflet marker clustering — `leaflet.markercluster` (via
`react-leaflet-cluster`) or `supercluster` — which groups nearby markers into
cluster bubbles **by zoom level** and expands them as the user zooms in. This is
sufficient up to the low tens of thousands of markers.

### 3.2 Viewport / bbox querying (scales further)

Only fetch markers inside the current map viewport. `GET /map/markers` accepts a
bounding box and uses a **2dsphere** `$geoWithin` query with `$box`:

```
GET /map/markers?bbox=33.9,-4.7,41.9,4.6&zoom=6
```

`bbox = minLng,minLat,maxLng,maxLat`.

```js
const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
const filter = {
  primaryLocation: {
    $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] }
  }
};
```

Apply **zoom-based limits**: at low zoom, cap results (e.g. `.limit(2000)`) or
delegate to server-side aggregation.

### 3.3 Optional server-side clustering (very large N)

For very large datasets, cluster on the server using an aggregation pipeline over
`master_people` — snap `primaryLocation` to a zoom-dependent grid and `$group` +
`$count` per cell, returning cluster centroids instead of individual features.
The map draws cluster bubbles from these aggregated buckets and only requests
individual markers once the user zooms past a threshold.

---

## 4. Filtering

All filters run against denormalized fields on `master_people`:

| Filter      | Field                                   | Example query param        |
| ----------- | --------------------------------------- | -------------------------- |
| Status      | embedded `status` summary (`people_statuses`) | `?status=engaged`    |
| Country     | `primaryCountryCode`                    | `?country=KE`              |
| Source type | `sourceTypes[]` (array membership)      | `?source=JP&source=DMM`    |

Example:

```
GET /map/markers?status=engaged&country=KE&source=JP&source=DMM&bbox=...&zoom=6
```

Source-type filtering uses array membership:

```js
if (sources?.length) filter.sourceTypes = { $in: sources };
```

---

## 5. Source visibility (KEY behavior)

Users can toggle **source layers** in the UI (JP, PeopleGroups, DMM, …). Because
a single master marker can be backed by multiple sources, the rule is:

> **A master marker stays VISIBLE as long as AT LEAST ONE of its `sourceTypes`
> is enabled.**

Exact rule:

```js
marker.visible = intersection(master.sourceTypes, enabledSources).length > 0;
```

### Worked example — "Sara Mbai"

`Sara Mbai` has `sourceTypes = ['JP', 'PeopleGroups', 'DMM']`.

| User action                     | enabledSources                  | intersection            | Marker |
| ------------------------------- | ------------------------------- | ----------------------- | ------ |
| All on                          | `['JP','PeopleGroups','DMM']`   | `['JP','PeopleGroups','DMM']` | ✅ visible |
| Hide **JP**                     | `['PeopleGroups','DMM']`        | `['PeopleGroups','DMM']` | ✅ **still visible** |
| Hide JP + PeopleGroups          | `['DMM']`                       | `['DMM']`               | ✅ visible |
| Hide all three                  | `[]`                            | `[]`                    | ❌ hidden |

Hiding **JP** does **not** remove Sara Mbai's marker, because PeopleGroups and
DMM still describe it. This is the central difference from today's behavior,
where hiding JP would remove one of two duplicate pins but leave the other.

### Where it's evaluated

- **Client-side (preferred, no refetch):** every marker feature already carries
  `properties.sourceTypes[]`. Toggling a layer just re-runs the intersection
  filter over the in-memory feature list — instant, no network call.
- **Server-side (optional):** pass the enabled sources as a filter and let Mongo
  do the membership test:

  ```js
  filter.sourceTypes = { $in: enabledSources };
  ```

---

## 6. Popup behavior

Clicking a marker opens a popup that shows:

1. `canonicalName`
2. **Aggregated status** (from the embedded status summary).
3. A **source breakdown** — one row per attached source, each with its own
   `name`, `population`, and `status`, pulled lazily from
   `GET /people/:id/sources`.

Example popup contents for Sara Mbai:

| Source        | Name        | Population | Status   |
| ------------- | ----------- | ---------- | -------- |
| JP            | Sara        | 480,000    | engaged  |
| PeopleGroups  | Sara Mbai   | 495,120    | engaged  |
| DMM           | Sara-Mbai   | —          | movement |

**Interaction:** toggling a source in the layer control **hides that source's
row** in the popup but does **not** hide the marker (unless it was the last
enabled source — see §5).

---

## 7. Statistics

`GET /map/statistics` returns counts by `status`, `country`, and `sourceType`,
computed via an **aggregation over `master_people`** using the denormalized
fields.

- Each master people is **counted once** — never double-counted across its
  sources. This is the core fix versus today, where the same group inflates
  totals once per source.
- `sourceType` counts use `$unwind` on `sourceTypes[]` so a master contributes to
  each of its source buckets, while status/country buckets count the master a
  single time.

Example response:

```json
{
  "totals": { "masterPeople": 1842 },
  "byStatus":  { "unengaged": 900, "engaged": 742, "movement": 200 },
  "byCountry": { "KE": 640, "TZ": 512, "UG": 690 },
  "bySourceType": { "JP": 1500, "PeopleGroups": 1100, "DMM": 320 }
}
```

---

## 8. Search

- Search by name queries `people_aliases` (which carries a **text index**) plus
  `canonicalName` on `master_people`.
- Results are always **master people** — never raw per-source rows.
- Selecting a result **flies to** `master.primaryLocation` (Leaflet
  `map.flyTo([lat, lng], zoom)`), then opens that master's marker/popup.

```
GET /people?q=sara
```

---

## 9. Reference snippets

### 9.1 `/map/markers` projection query

```js
// GET /map/markers?bbox=minLng,minLat,maxLng,maxLat&zoom=6&status=&country=&source=
async function getMapMarkers(req, res) {
  const { bbox, zoom, status, country } = req.query;
  const sources = [].concat(req.query.source || []);

  const filter = {};

  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    filter.primaryLocation = {
      $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] }
    };
  }
  if (status)          filter.status = status;
  if (country)         filter.primaryCountryCode = country;
  if (sources.length)  filter.sourceTypes = { $in: sources };

  const limit = Number(zoom) < 7 ? 2000 : 20000;

  const docs = await MasterPeople.find(filter)
    .select({
      canonicalName: 1,
      primaryCountryCode: 1,
      status: 1,
      sourceTypes: 1,
      primaryLocation: 1
    })
    .limit(limit)
    .lean(); // plain objects — no Mongoose hydration

  const features = docs.map((d) => ({
    type: 'Feature',
    geometry: d.primaryLocation, // already GeoJSON Point [lng, lat]
    properties: {
      id: String(d._id),
      canonicalName: d.canonicalName,
      primaryCountryCode: d.primaryCountryCode,
      status: d.status,
      sourceTypes: d.sourceTypes
    }
  }));

  res.json({ type: 'FeatureCollection', features });
}
```

### 9.2 Client-side source visibility

```js
// enabledSources: Set<string> from the layer control, e.g. new Set(['PeopleGroups','DMM'])
function isMarkerVisible(feature, enabledSources) {
  const { sourceTypes } = feature.properties;
  return sourceTypes.some((s) => enabledSources.has(s));
  // === intersection(sourceTypes, enabledSources).length > 0
}

// Re-filter in place on toggle — no refetch needed
const visibleFeatures = featureCollection.features.filter((f) =>
  isMarkerVisible(f, enabledSources)
);
```
