#!/usr/bin/env node
/**
 * fix-mojibake.mjs
 *
 * Repairs double-encoded (mojibake) text where original UTF-8 bytes were
 * misinterpreted as Windows-1252/Latin-1 and re-saved as UTF-8.
 *
 * Strategy:
 *   corrupted = utf8_decode( latin1_bytes_of( original_utf8 ) )
 *   fix       = utf8_decode( latin1_encode( corrupted ) )
 *
 * We ONLY rewrite a file when:
 *   1. The file currently contains known mojibake marker sequences, AND
 *   2. Re-decoding is loss-less (round-trips) and removes the markers, AND
 *   3. The fixed text has NO U+FFFD replacement chars.
 *
 * Usage:
 *   node scripts/fix-mojibake.mjs            # dry-run, lists files + sample diffs
 *   node scripts/fix-mojibake.mjs --write    # apply fixes in place
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WRITE = process.argv.includes('--write');

const SCAN_DIRS = ['frontend/src', 'backend'];
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.html', '.css']);
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

// Marker sequences that strongly indicate mojibake (UTF-8-as-Latin1).
// "Ã" = 0xC3 lead byte of 2-byte UTF-8; "â" = 0xE2 lead of 3-byte; "ð" = 0xF0 lead of 4-byte (emoji).
const MOJIBAKE_RE = /[\u00C3\u00C2][\u0080-\u00BF]|\u00E2[\u0080-\u00BF]{2}|\u00F0\u0178|\u00C3\u00A9|\u00C3\u00A8|\u00C3\u00A0|\u00C3\u00A7|\u00C3\u2030|\u00C3\u00B4/;

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.postman') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(full, out);
    } else if (EXT.has(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Files mix CORRECT UTF-8 (real emoji 🇨🇲, accents é, em dash —) with mojibake.
 * Mojibake = original UTF-8 bytes shown through a CP1252 lens. To reverse it we
 * must (a) map each visible char back to the CP1252 BYTE it stands for, then
 * (b) decode those bytes as UTF-8 — but ONLY for maximal substrings that form a
 * COMPLETE, VALID multi-byte UTF-8 sequence. Isolated already-correct chars
 * (e.g. a real "—" U+2014) do NOT map to a CP1252 byte, so they are left alone.
 */

// Reverse CP1252: visible char -> the single byte (0x00–0xFF) it represents.
// Identity for 0x00–0x7F and 0xA0–0xFF; plus the 27 CP1252 "special" glyphs
// that occupy 0x80–0x9F. Any char NOT in this map cannot be part of mojibake.
const CP1252 = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

// The 5 byte slots CP1252 leaves undefined (0x81,0x8D,0x8F,0x90,0x9D) are
// commonly passed through as the raw code point U+0081.. by lenient decoders.
const UNMAPPED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

function toByte(cp) {
  if (cp <= 0x7f) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  if (UNMAPPED.has(cp)) return cp; // raw passthrough of undefined CP1252 slot
  if (CP1252[cp] !== undefined) return CP1252[cp];
  return -1; // not representable as a CP1252 byte => cannot be mojibake
}

// How many continuation bytes a UTF-8 lead byte needs (0 = not a lead / ascii).
function seqLen(b) {
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

/**
 * Repair mojibake by scanning for valid UTF-8 sequences encoded as CP1252
 * glyphs. Only complete, valid sequences whose lead byte is >= 0xC2 are
 * converted; everything else (ASCII, lone correct chars) is passed through.
 */
function repair(text) {
  const cps = Array.from(text);
  let out = '';
  let i = 0;
  let changed = false;
  while (i < cps.length) {
    const b0 = toByte(cps[i].codePointAt(0));
    const need = b0 >= 0 ? seqLen(b0) : 0;
    if (need >= 2) {
      // Gather `need` CP1252 bytes if they are all valid continuation bytes.
      const bytes = [b0];
      let ok = true;
      for (let k = 1; k < need; k++) {
        const bk = i + k < cps.length ? toByte(cps[i + k].codePointAt(0)) : -1;
        if (bk < 0x80 || bk > 0xbf) { ok = false; break; }
        bytes.push(bk);
      }
      if (ok) {
        const decoded = Buffer.from(bytes).toString('utf8');
        // Valid, non-replacement decode of the exact length we expected?
        if (!decoded.includes('\uFFFD')) {
          out += decoded;
          i += need;
          changed = true;
          continue;
        }
      }
    }
    out += cps[i];
    i++;
  }
  if (!changed || MOJIBAKE_RE.test(out)) {
    // Either nothing changed, or residual markers remain (unexpected) — if
    // still improved, keep it; otherwise signal no safe fix.
    if (!changed) return null;
  }
  return out;
}

const files = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

const changed = [];
const skipped = [];

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!MOJIBAKE_RE.test(raw)) continue;
  const fixed = repair(raw);
  if (!fixed) { skipped.push(file); continue; }
  if (MOJIBAKE_RE.test(fixed)) { skipped.push(file); continue; }
  changed.push({ file, raw, fixed });
}

console.log(`Scanned ${files.length} files.`);
console.log(`Mojibake detected & repairable: ${changed.length}`);
if (skipped.length) {
  console.log(`\nWARNING: ${skipped.length} file(s) had markers but could not be safely repaired:`);
  for (const s of skipped) console.log('  - ' + path.relative(ROOT, s));
}

for (const { file, raw, fixed } of changed) {
  const rel = path.relative(ROOT, file);
  if (WRITE) {
    fs.writeFileSync(file, fixed, 'utf8');
    console.log('FIXED  ' + rel);
  } else {
    // Show a short sample of the first differing line.
    const rl = raw.split(/\r?\n/);
    const fl = fixed.split(/\r?\n/);
    let sample = '';
    for (let i = 0; i < rl.length; i++) {
      if (rl[i] !== fl[i]) {
        sample = `\n    - ${rl[i].trim().slice(0, 90)}\n    + ${fl[i].trim().slice(0, 90)}`;
        break;
      }
    }
    console.log('WOULD FIX  ' + rel + sample);
  }
}

if (!WRITE) {
  console.log('\nDry-run only. Re-run with --write to apply.');
}
