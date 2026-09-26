'use strict';

const { Readable } = require('stream');
const csv = require('csv-parser');
const mongoose = require('mongoose');
const PeopleGroup = require('../models/PeopleGroup');
const User = require('../models/User');

const SOURCE = 'Finishing the Task';

// ── helpers ──────────────────────────────────────────────────────────────────

function removeBOM(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/^\uFEFF/, '').replace(/^\u00EF\u00BB\u00BF/, '');
}

function sanitizeString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseIntVal(val) {
  return Math.floor(parseNumber(val));
}

function normalizeEncoding(buffer) {
  let str = buffer.toString('utf8');
  str = removeBOM(str);
  str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return str;
}

function detectDelimiter(firstLine) {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function normalizeKey(key) {
  return removeBOM(key).trim().toLowerCase().replace(/\s+/g, '');
}

function calculateEngagementStatus(pct) {
  if (pct === 0) return 'unreached';
  if (pct <= 33) return 'pioneer';
  if (pct <= 66) return 'midway';
  if (pct <= 99) return 'tipping-point';
  return 'dmm';
}

function engagementToLegacyStatus(eng) {
  if (eng === 'midway') return 'mid-journey';
  if (eng === 'dmm') return 'movement';
  return eng;
}

async function resolveCreatedBy() {
  let user = await User.findOne({ role: 'admin' }).lean();
  if (!user) user = await User.findOne({}).lean();
  if (user) return user._id;
  return new mongoose.Types.ObjectId();
}

// ── column lookup helpers ─────────────────────────────────────────────────────

function pick(row, ...candidates) {
  for (const c of candidates) {
    const k = normalizeKey(c);
    for (const [rk, rv] of Object.entries(row)) {
      if (normalizeKey(rk) === k) return rv;
    }
  }
  return '';
}

// ── main class ────────────────────────────────────────────────────────────────

class FinishingTheTaskService {
  constructor() {
    this.lastSynced = null;
  }

  async importFromCSV(buffer) {
    const cleanedContent = normalizeEncoding(buffer);
    const lines = cleanedContent.split('\n');
    const nonCommentLines = lines.filter(l => !l.trimStart().startsWith('#'));
    const firstLine = nonCommentLines[0] || '';
    const separator = detectDelimiter(firstLine);
    const cleanedForParse = nonCommentLines.join('\n');

    const rows = await new Promise((resolve, reject) => {
      const results = [];
      const readable = Readable.from([cleanedForParse]);
      readable
        .pipe(csv({ separator, strict: false, relaxColumnCount: true }))
        .on('data', row => results.push(row))
        .on('end', () => resolve(results))
        .on('error', reject);
    });

    const createdBy = await resolveCreatedBy();
    let imported = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails = [];

    for (const row of rows) {
      try {
        // flexible column lookup – FTT / UUPG common headers
        const name = sanitizeString(
          pick(
            row,
            'PeopNameInCountry', 'PeopleName', 'People Name', 'Name', 'name',
            'UPG', 'upg', 'GroupName', 'groupname', 'people_name', 'peoplename'
          )
        );
        if (!name) continue;

        const latRaw = pick(row, 'Latitude', 'latitude', 'lat', 'Lat');
        const lngRaw = pick(row, 'Longitude', 'longitude', 'lng', 'Lng', 'lon', 'Lon');
        const lat = parseNumber(latRaw);
        const lng = parseNumber(lngRaw);

        let countryCode = sanitizeString(
          pick(
            row,
            'ROG3', 'CountryCode', 'country_code', 'countrycode',
            'ISO2', 'iso2', 'CC', 'cc'
          )
        ).toUpperCase();
        if (countryCode.length > 2) countryCode = countryCode.substring(0, 2);

        const country = sanitizeString(
          pick(row, 'Ctry', 'Country', 'country', 'CountryName', 'countryname')
        );
        const language = sanitizeString(
          pick(
            row,
            'PrimaryLanguageName', 'Language', 'language', 'lang',
            'PrimaryLanguage', 'primarylanguage'
          )
        );
        const religion = sanitizeString(
          pick(row, 'PrimaryReligion', 'Religion', 'religion')
        );
        const population = parseIntVal(
          pick(row, 'Population', 'population', 'pop', 'Pop', 'PopulationTotal', 'populationtotal')
        );
        const region = sanitizeString(
          pick(row, 'Region', 'region', 'RegionName', 'regionname', 'Continent', 'continent')
        );

        const pctChristianRaw = pick(
          row,
          'PercentChristianity', 'PercentChristian', 'percent_christian',
          'pct_christian', 'pctchristian', 'percentchristianity',
          'ChristianPct', 'christianpct', 'PChrn', 'pchrn'
        );
        const pctChristian = parseNumber(pctChristianRaw);
        const engagementStatus = calculateEngagementStatus(pctChristian);
        const status = engagementToLegacyStatus(engagementStatus);

        const coordinates = (lat !== 0 || lng !== 0) ? [lng, lat] : [0, 0];

        const sourceData = Object.assign({}, row);

        const filter = { name, source: SOURCE };
        if (countryCode) filter.countryCode = countryCode;

        const update = {
          $set: {
            name,
            'location.coordinates': coordinates,
            status,
            engagementStatus,
            countryCode: countryCode || undefined,
            country: country || undefined,
            language: language || undefined,
            religion: religion || undefined,
            population: population || undefined,
            region: region || undefined,
            source: SOURCE,
            sourceData,
            approved: false,
            createdBy,
          },
        };

        const result = await PeopleGroup.findOneAndUpdate(filter, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        });

        if (result) {
          const diff = Math.abs(result.updatedAt - result.createdAt);
          if (diff < 2000) imported++;
          else updated++;
        }
      } catch (err) {
        errors++;
        errorDetails.push({ row: JSON.stringify(row).substring(0, 120), error: err.message });
      }
    }

    this.lastSynced = new Date();

    return {
      success: true,
      imported,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 20),
      total: rows.length,
    };
  }

  async getAllPeopleGroups(options = {}) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc',
      country,
      status,
      source,
    } = options;

    const query = { source: SOURCE };
    if (country) query.countryCode = country.toUpperCase();
    if (status) query.status = status;
    if (source) query.source = source;

    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      PeopleGroup.find(query).sort(sort).skip(skip).limit(limit).lean(),
      PeopleGroup.countDocuments(query),
    ]);

    return {
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSyncStatus() {
    const query = { source: SOURCE };

    const [
      totalRecords,
      populationAgg,
      byCountryAgg,
      byStatusAgg,
    ] = await Promise.all([
      PeopleGroup.countDocuments(query),
      PeopleGroup.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$population' } } },
      ]),
      PeopleGroup.aggregate([
        { $match: query },
        { $group: { _id: '$countryCode', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      PeopleGroup.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const totalPopulation = populationAgg.length > 0 ? populationAgg[0].total : 0;
    const byCountry = {};
    byCountryAgg.forEach(item => { byCountry[item._id || 'unknown'] = item.count; });
    const byStatus = {};
    byStatusAgg.forEach(item => { byStatus[item._id || 'unknown'] = item.count; });

    return {
      totalRecords,
      totalPopulation,
      byCountry,
      byStatus,
      lastSynced: this.lastSynced,
    };
  }

  async clearAllData() {
    const result = await PeopleGroup.deleteMany({ source: SOURCE });
    this.lastSynced = null;
    return { success: true, deletedCount: result.deletedCount };
  }
}

module.exports = new FinishingTheTaskService();
