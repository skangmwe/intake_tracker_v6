#!/usr/bin/env node
// verify-design-fidelity-manifest.mjs — assert that the clean-run cache's
// evidence_manifest covers the current Prototype-tagged screen set plus the
// APP (app-wide look) and SHELL (persistent frame) buckets, with a per-screen
// COMPARISON RECORD proving each screen was rendered and compared against the
// prototype.
//
// The audit this validates is build-vs-prototype (render & compare): for every
// prototyped screen, the reviewer renders the prototype and the build and
// records the comparison. See shared/design-fidelity-web.md for the full spec.
//
// This file is BOTH a library (importable from tests / future Node code)
// AND a CLI entry point (invoked by the review skills via `node ...`).
// The pure function `validateManifest({ root, cachePath })` does the work
// and returns `{ verdict, exitCode }`; the CLI wrapper at the bottom prints
// the verdict and exits when this file is run as the main module.
//
// Evidence requirements are derived from a single declarative table
// (EVIDENCE_REQUIREMENTS, exported below) so the documentation, the
// validator, and the tests share one source of truth.
//
// Called from:
//   - /review (or /dev-review-and-remediate) just before writing the cache.
//   - /ship (or /dev-ship) before deciding to skip review on a cache hit.
//
// Exit codes:
//   0 — VALID
//   1 — anything else (NO_CACHE, MISSING, NO_SHELL, NO_APP, STALE, BAD_ROW,
//       schema-version mismatch, JSON parse failure)
//
// Output (stdout, single line — same contract whether run as CLI or
// returned from validateManifest):
//   MANIFEST: VALID
//   MANIFEST: NO_CACHE (cache file does not exist)
//   MANIFEST: MISSING (no evidence_manifest field in cache)
//   MANIFEST: NO_SHELL (manifest is present but lacks the SHELL entry)
//   MANIFEST: NO_APP (manifest lacks the APP app-wide bucket)
//   MANIFEST: STALE (missing keys: S3 S4)
//   MANIFEST: STALE (extra keys: S9)
//   MANIFEST: STALE (JSON parse failed: ...)
//   MANIFEST: STALE (schema_version mismatch: cache=X, validator=Y)
//   MANIFEST: STALE (prototype bundle changed since the cache was written ...)
//   MANIFEST: BAD_ROW (S2: prototype-tagged screen with verdict=visual-drift requires prototype_shot + build_shot)
//
// Comparison-record shape (each value in evidence_manifest):
//   { app_route, prototype_source, prototype_shot, build_shot, verdict,
//     discrepancies: [ { dimension, prototype_value, build_value, verdict } ],
//     enumerated_components: [ { type, ordinal } ],   // prototype screens — the
//                                                     // enumerator ground truth
//     components: [ {                                  // one per enumerated comp
//       type, ordinal, prototype_selector, build_selector, verdict,
//       requires_active,                               // prototype defines :active
//       state_shots: [ { state, selector, shot } ],    // hover + focus-visible (+active)
//       prototype_computed: { <prop>: <value> },       // render-states COMPUTED, proto
//       build_computed:     { <prop>: <value> },       // render-states COMPUTED, build
//     } ] }
//   — Prototype-tagged screens require enumerated_components + a components[]
//     entry per enumerated component, each with its interaction-state captures
//     and the two computed-style reads the validator diffs. See
//     EVIDENCE_REQUIREMENTS / COMPONENT_* below and shared/design-fidelity-web.md.
//
// Usage (CLI):
//   node .claude/hooks/verify-design-fidelity-manifest.mjs [project-root] [cache-path]
//
// Defaults: project-root = cwd; cache-path =
//   <project-root>/artifacts/docs/dev/reviews/.last-clean-run.json
// (analyst workspace shape). Dev-tree callers MUST pass an explicit cache path.
//
// Hash pinning:
//   The cache MUST carry "blueprint_hash" (content hash of
//   full-design-blueprint.md) and "prototype_bundle_hash" (a deterministic
//   hash of every file under artifacts/docs/design/project/). The validator
//   recomputes both and reports STALE on mismatch — a blueprint edit or a
//   prototype re-export between /review and /ship invalidates the cache, so
//   stale evidence can never certify a /ship skip.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMPUTED_STYLE_PROPS } from './ds-component-vocabulary.mjs';

// Schema history:
//   1.0 → 1.1  : blueprint_hash became required.
//   1.1 → 1.2  : audit reoriented to build-vs-element-contract; per-element
//                rows + element_contract_hash.
//   1.2 → 2.0  : audit reoriented to build-vs-prototype (render & compare). The
//                element-contract is gone; the manifest is now a per-screen
//                COMPARISON RECORD (app_route + prototype_shot + build_shot +
//                verdict + discrepancies). element_contract_hash is replaced by
//                prototype_bundle_hash. Caches written under an older version are
//                invalidated (forcing a fresh /review) the first time this runs.
//   2.0 → 3.0  : per-COMPONENT coverage. Each prototype screen records
//                `enumerated_components` (the enumerate-prototype-components.mjs
//                ground-truth set) and a `components[]` array; the validator
//                FAILs if any enumerated component is missing from components[],
//                if a component lacks its required interaction-state captures
//                (hover + focus-visible, + active where requires_active), or if
//                a component's verdict is `match` while its recorded
//                prototype_computed vs build_computed differ beyond tolerance
//                (px lengths within ±1px; everything else exact). Whole-screen
//                eyeballing can no longer produce a passing manifest.
export const VALIDATOR_SCHEMA_VERSION = '3.0';

// Verdicts the render-and-compare audit may assign to a screen (or a
// discrepancy within it). `match` is the only non-finding verdict.
export const VALID_VERDICTS = [
  'match',
  'visual-drift',
  'missing-element',
  'added-element',
  'not-implemented',
  'raw-literal',
  'style-inconsistent',
  'content-drift',
  'NOT REVIEWED',
];

// Verdicts that describe a concrete difference and therefore require a
// non-empty discrepancies[] (each naming the dimension + the values).
export const DRIFT_VERDICTS = [
  'visual-drift',
  'missing-element',
  'added-element',
  'raw-literal',
  'style-inconsistent',
  'content-drift',
];

// Verdicts that exempt a screen from the "both renders captured" requirement —
// the screen wasn't built (`not-implemented`) or couldn't be reviewed.
const NO_RENDER_VERDICTS = ['not-implemented', 'NOT REVIEWED'];

// Declarative per-entry requirements, keyed by the screen's CLASS. The
// validator consumes this; tests import it; shared/design-fidelity-web.md
// hand-mirrors it.
//   - requiredShots: render fields that must be non-empty (unless the verdict
//     is in NO_RENDER_VERDICTS).
//   - requiredStateShots: interaction states that must each have a forced-state
//     capture in the entry's `state_shots[]` array (unless NO_RENDER_VERDICTS).
//     `state_shots` is `[{ state, selector, shot }]`; a state counts as captured
//     only when an entry names that `state` with a non-empty `shot`. This is the
//     deterministic enforcement of interaction-state evidence — without it a
//     sub-agent could compare default state only and still validate.
//   - requiresRoute: app_route must be non-empty (unless NO_RENDER_VERDICTS).
//   - allowedVerdicts: the verdicts valid for this class.
// Prototype-tagged screens are compared against the prototype (both default-state
// shots AND forced interaction-state shots); Save-for-/build screens have no
// prototype (build shot only); APP/SHELL are cross-cutting (build shot, route not
// meaningful).
export const EVIDENCE_REQUIREMENTS = {
  prototype: {
    requiredShots: ['prototype_shot', 'build_shot'],
    requiresRoute: true,
    // Interaction-state evidence + the geometry diff now live PER COMPONENT
    // (see COMPONENT_REQUIRED_STATES + the components[] validation), so a
    // prototype screen must carry per-component coverage rather than only
    // screen-level state shots.
    requiresComponents: true,
    allowedVerdicts: ['match', 'visual-drift', 'missing-element', 'added-element', 'not-implemented', 'raw-literal', 'NOT REVIEWED'],
  },
  'save-for-build': {
    requiredShots: ['build_shot'],
    requiresRoute: true,
    allowedVerdicts: ['match', 'style-inconsistent', 'content-drift', 'not-implemented', 'NOT REVIEWED'],
  },
  app: {
    requiredShots: ['build_shot'],
    requiresRoute: false,
    allowedVerdicts: ['match', 'visual-drift', 'style-inconsistent', 'not-implemented', 'NOT REVIEWED'],
  },
  shell: {
    requiredShots: ['build_shot'],
    requiresRoute: false,
    allowedVerdicts: ['match', 'visual-drift', 'missing-element', 'added-element', 'not-implemented', 'NOT REVIEWED'],
  },
};

// Interaction states every enumerated component must capture. `active` is added
// per-component only when the prototype defines a distinct :active style (the
// record sets requires_active) — a static badge has no meaningful active state.
// Default-state geometry is covered by the computed-style diff, not a state shot.
export const COMPONENT_REQUIRED_STATES = ['hover', 'focus-visible'];

// Verdicts a per-component record may carry. `match` is the only non-finding one.
export const COMPONENT_VERDICTS = [
  'match', 'visual-drift', 'missing-element', 'added-element',
  'style-inconsistent', 'not-implemented', 'NOT REVIEWED',
];

// Parse a single CSS px length → number, else null (keywords, colors, %, etc.).
function parsePx(value) {
  const m = /^(-?\d*\.?\d+)px$/.exec(String(value == null ? '' : value).trim());
  return m ? parseFloat(m[1]) : null;
}

// Diff two computed-style reads over the curated property set. A px-length
// value is compared within ±1px (absorbs sub-pixel rounding between the design-
// tool prototype and the React build); everything else — keywords, numeric
// font-weight, normalized rgb colors — must match exactly. Returns the deltas.
// This is the deterministic catch for flex:1 / width / packed-vs-distributed
// drift that a screenshot comparison misses. Exported for tests.
export function styleDeltas(prototypeComputed, buildComputed) {
  const proto = prototypeComputed || {};
  const build = buildComputed || {};
  const deltas = [];
  for (const prop of COMPUTED_STYLE_PROPS) {
    const a = proto[prop] == null ? '' : String(proto[prop]).trim();
    const b = build[prop] == null ? '' : String(build[prop]).trim();
    if (a === b) continue;
    const pa = parsePx(a);
    const pb = parsePx(b);
    if (pa !== null && pb !== null) {
      if (Math.abs(pa - pb) > 1) deltas.push({ prop, prototype_value: a, build_value: b });
    } else {
      deltas.push({ prop, prototype_value: a, build_value: b });
    }
  }
  return deltas;
}

// Canonical paths, relative to the project root.
export const BLUEPRINT_REL_PATH = path.join('artifacts', 'docs', 'design', 'full-design-blueprint.md');
export const PROTOTYPE_BUNDLE_REL_PATH = path.join('artifacts', 'docs', 'design', 'project');

function hashFile(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try {
    const content = fs.readFileSync(absPath); // raw bytes — exact-match semantics
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

// Content hash of the blueprint the evidence was gathered against.
export function computeBlueprintHash(root) {
  return hashFile(path.join(root, BLUEPRINT_REL_PATH));
}

// Deterministic content hash of the prototype bundle the build was compared
// against — a re-export (new/changed/removed files) changes it. Walks
// artifacts/docs/design/project/ recursively, sorts paths, and hashes each
// file's relative path + bytes. Returns null when the bundle is absent.
export function computePrototypeBundleHash(root) {
  const dir = path.join(root, PROTOTYPE_BUNDLE_REL_PATH);
  if (!fs.existsSync(dir)) return null;
  const files = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const full = path.join(d, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) files.push(full);
    }
  };
  try {
    walk(dir);
  } catch {
    return null;
  }
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    hash.update(rel + '\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return 'sha256:' + hash.digest('hex');
}

// Non-empty string helper.
const present = (v) => typeof v === 'string' && v.trim() !== '';

// ───────────────────────────────────────────────────────────────────────────
// Pure library function. Returns { verdict, exitCode }. No process.exit,
// no stdout. Callers (CLI wrapper, tests) handle IO themselves.
// ───────────────────────────────────────────────────────────────────────────

export function validateManifest({ root, cachePath }) {
  const ROOT = root || process.cwd();
  const CACHE =
    cachePath || path.join(ROOT, 'artifacts', 'docs', 'dev', 'reviews', '.last-clean-run.json');

  if (!fs.existsSync(CACHE)) {
    return { verdict: 'MANIFEST: NO_CACHE', exitCode: 1 };
  }

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } catch (err) {
    return {
      verdict: `MANIFEST: STALE (JSON parse failed: ${String(err.message).split('\n')[0]})`,
      exitCode: 1,
    };
  }

  // Schema-version check.
  if (cache && typeof cache.schema_version === 'string') {
    if (cache.schema_version !== VALIDATOR_SCHEMA_VERSION) {
      return {
        verdict: `MANIFEST: STALE (schema_version mismatch: cache=${cache.schema_version}, validator=${VALIDATOR_SCHEMA_VERSION})`,
        exitCode: 1,
      };
    }
  } else if (cache && typeof cache === 'object' && cache.evidence_manifest) {
    return {
      verdict:
        'MANIFEST: STALE (schema_version missing — cache predates render-and-compare validator; re-run /review to regenerate)',
      exitCode: 1,
    };
  }

  const manifest = cache && cache.evidence_manifest;
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.keys(manifest).length === 0
  ) {
    return { verdict: 'MANIFEST: MISSING (no evidence_manifest field in cache)', exitCode: 1 };
  }

  const manifestKeys = Object.keys(manifest).sort();

  if (!manifestKeys.includes('SHELL')) {
    return { verdict: 'MANIFEST: NO_SHELL', exitCode: 1 };
  }
  if (!manifestKeys.includes('APP')) {
    return { verdict: 'MANIFEST: NO_APP (app-wide bucket is required)', exitCode: 1 };
  }

  // Blueprint-content check — runs BEFORE the screen-key comparison.
  const currentBlueprintHash = computeBlueprintHash(ROOT);
  if (!present(cache.blueprint_hash)) {
    return {
      verdict:
        'MANIFEST: STALE (blueprint_hash missing — cache predates content-hash pinning; re-run /review to regenerate)',
      exitCode: 1,
    };
  }
  if (currentBlueprintHash === null) {
    return {
      verdict:
        'MANIFEST: STALE (blueprint not found at artifacts/docs/design/full-design-blueprint.md but cache pins a hash)',
      exitCode: 1,
    };
  }
  if (cache.blueprint_hash !== currentBlueprintHash) {
    return {
      verdict:
        'MANIFEST: STALE (blueprint changed since the cache was written — re-run /review to re-audit against the updated blueprint)',
      exitCode: 1,
    };
  }

  // Prototype-bundle check — the render-and-compare reference. A re-export
  // between /review and /ship must invalidate the cache the same way.
  const currentBundleHash = computePrototypeBundleHash(ROOT);
  if (!present(cache.prototype_bundle_hash)) {
    return {
      verdict:
        'MANIFEST: STALE (prototype_bundle_hash missing — cache predates prototype pinning; re-run /review to regenerate)',
      exitCode: 1,
    };
  }
  if (currentBundleHash === null) {
    return {
      verdict:
        'MANIFEST: STALE (prototype bundle not found at artifacts/docs/design/project/ but cache pins a hash)',
      exitCode: 1,
    };
  }
  if (cache.prototype_bundle_hash !== currentBundleHash) {
    return {
      verdict:
        'MANIFEST: STALE (prototype bundle changed since the cache was written — re-run /review to re-compare against the updated prototype)',
      exitCode: 1,
    };
  }

  // Re-run the enumerate hook against the current blueprint. Prototype-tagged
  // screens are REQUIRED keys (they must be compared against the prototype);
  // Save-for-/build screens are ALLOWED keys (consistency/content checks) but
  // not required by this gate. APP and SHELL are synthetic keys always required.
  const enumeratePath = path.join(ROOT, '.claude', 'hooks', 'enumerate-blueprint-screens.sh');
  let enumOutput = '';
  let enumOk = false;
  try {
    const result = spawnSync('bash', [enumeratePath, ROOT], { encoding: 'utf8' });
    if (!result.error && result.status === 0) {
      enumOutput = result.stdout || '';
      enumOk = true;
    }
  } catch {
    enumOk = false;
  }

  // FAIL CLOSED if enumeration could not run or found no screen map. Otherwise a
  // host where `bash` isn't on PATH (the default on Windows without Git Bash)
  // would yield an empty screen set → requiredKeys = ['APP','SHELL'] → a manifest
  // covering only APP+SHELL would validate. That is the exact "skip-as-pass"
  // failure this gate exists to prevent: a coverage check that can't enumerate
  // the screens must never certify coverage. (The review's other hooks already
  // require bash, so this is consistent — never a false pass.)
  const enumVerdictLine = enumOutput.split('\n').find((l) => l.startsWith('BLUEPRINT-SCREENS:')) || '';
  if (!enumOk || !enumVerdictLine || enumVerdictLine.includes('ABSENT')) {
    return {
      verdict:
        'MANIFEST: STALE (screen enumeration failed — could not run enumerate-blueprint-screens.sh, or it found no screen-map table; coverage cannot be verified, so the gate fails closed)',
      exitCode: 1,
    };
  }

  const isNonPrototypeTag = (tag) => /save\s*[-/ ]*for|deferred/i.test(tag || '');
  const enumRows = enumOutput
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('BLUEPRINT-SCREENS:'))
    .map((line) => line.split('\t'))
    .filter((cols) => cols[0]);

  const prototypeKeys = Array.from(
    new Set(enumRows.filter((cols) => !isNonPrototypeTag(cols[2])).map((cols) => cols[0])),
  );
  const saveForBuildKeys = Array.from(
    new Set(enumRows.filter((cols) => isNonPrototypeTag(cols[2])).map((cols) => cols[0])),
  );

  const requiredKeys = Array.from(new Set([...prototypeKeys, 'APP', 'SHELL'])).sort();
  const allowedKeys = Array.from(
    new Set([...prototypeKeys, ...saveForBuildKeys, 'APP', 'SHELL']),
  );

  const missing = requiredKeys.filter((k) => !manifestKeys.includes(k));
  const extra = manifestKeys.filter((k) => !allowedKeys.includes(k));

  if (missing.length > 0) {
    return { verdict: `MANIFEST: STALE (missing keys: ${missing.join(' ')})`, exitCode: 1 };
  }
  if (extra.length > 0) {
    return { verdict: `MANIFEST: STALE (extra keys: ${extra.join(' ')})`, exitCode: 1 };
  }

  // Classify each manifest key so we can apply the right per-entry rules.
  const classOf = (key) => {
    if (key === 'APP') return 'app';
    if (key === 'SHELL') return 'shell';
    if (saveForBuildKeys.includes(key)) return 'save-for-build';
    return 'prototype';
  };

  // Per-entry comparison-record validation.
  const badRows = [];
  for (const key of manifestKeys) {
    const entry = manifest[key] || {};
    const klass = classOf(key);
    const spec = EVIDENCE_REQUIREMENTS[klass];
    const verdict = entry.verdict || '';

    if (!present(verdict)) {
      badRows.push(`${key}: verdict is empty`);
      continue;
    }
    if (!VALID_VERDICTS.includes(verdict)) {
      badRows.push(`${key}: verdict=${verdict} is not a known verdict`);
      continue;
    }
    if (!spec.allowedVerdicts.includes(verdict)) {
      badRows.push(`${key}: verdict=${verdict} is not valid for a ${klass} screen`);
      continue;
    }

    const exemptFromRender = NO_RENDER_VERDICTS.includes(verdict);
    if (!exemptFromRender) {
      for (const shot of spec.requiredShots) {
        if (!present(entry[shot])) {
          badRows.push(
            `${key}: ${klass}-class screen with verdict=${verdict} requires ${spec.requiredShots.join(' + ')}`,
          );
          break;
        }
      }
      if (spec.requiresRoute && !present(entry.app_route)) {
        badRows.push(`${key}: verdict=${verdict} requires app_route`);
      }
      // Per-component coverage (schema 3.0): every component the enumerator
      // detected on this screen must be individually diffed — with its
      // interaction-state captures and a geometry diff. Whole-screen eyeballing
      // can no longer produce a passing manifest.
      if (spec.requiresComponents) {
        const enumerated = Array.isArray(entry.enumerated_components) ? entry.enumerated_components : null;
        if (!enumerated) {
          badRows.push(
            `${key}: prototype screen with verdict=${verdict} must record enumerated_components[] (the enumerate-prototype-components.mjs output) — without it per-component coverage cannot be verified`,
          );
        } else {
          const components = Array.isArray(entry.components) ? entry.components : [];
          const covered = new Set(
            components.filter((c) => c && present(c.type) && c.ordinal != null).map((c) => `${c.type}#${c.ordinal}`),
          );
          // 1. Coverage: every enumerated component must appear in components[].
          for (const ec of enumerated) {
            if (!ec || !present(ec.type) || ec.ordinal == null) {
              badRows.push(`${key}: an enumerated_components entry is missing type/ordinal`);
              continue;
            }
            if (!covered.has(`${ec.type}#${ec.ordinal}`)) {
              badRows.push(
                `${key}: component ${ec.type}#${ec.ordinal} was enumerated on this screen but has no entry in components[] — a per-component diff is required, not a whole-screen glance`,
              );
            }
          }
          // 2. Each component record: verdict, interaction states, geometry diff.
          for (const comp of components) {
            const c = comp || {};
            const cid = present(c.type) && c.ordinal != null ? `${c.type}#${c.ordinal}` : '(unkeyed)';
            const cv = c.verdict || '';
            if (!present(cv) || !COMPONENT_VERDICTS.includes(cv)) {
              badRows.push(`${key}/${cid}: component verdict=${cv || '(empty)'} is not a valid component verdict`);
              continue;
            }
            if (NO_RENDER_VERDICTS.includes(cv)) continue; // not-implemented / NOT REVIEWED exempt
            const stateShots = Array.isArray(c.state_shots) ? c.state_shots : [];
            const captured = new Set(
              stateShots.filter((s) => s && present(s.state) && present(s.shot)).map((s) => s.state),
            );
            const requiredStates = [...COMPONENT_REQUIRED_STATES, ...(c.requires_active ? ['active'] : [])];
            const missingStates = requiredStates.filter((st) => !captured.has(st));
            if (missingStates.length > 0) {
              badRows.push(`${key}/${cid}: missing interaction-state captures (state_shots) for ${missingStates.join(' + ')}`);
            }
            // Geometry diff — the validator owns the ±1px/exact comparison.
            if (typeof c.prototype_computed !== 'object' || c.prototype_computed === null ||
                typeof c.build_computed !== 'object' || c.build_computed === null) {
              badRows.push(`${key}/${cid}: requires prototype_computed + build_computed (render-states COMPUTED reads) so the geometry diff can run`);
            } else if (cv === 'match') {
              const deltas = styleDeltas(c.prototype_computed, c.build_computed);
              if (deltas.length > 0) {
                badRows.push(`${key}/${cid}: verdict=match but computed style differs on ${deltas.map((d) => d.prop).join(', ')} — a layout/token delta is drift, not a match`);
              }
            }
          }
          // 3. A screen is `match` only if every enumerated component matched.
          if (verdict === 'match') {
            const drifted = components.filter((c) => c && c.verdict && c.verdict !== 'match');
            if (drifted.length > 0) {
              badRows.push(`${key}: screen verdict=match but ${drifted.length} component(s) carry a non-match verdict`);
            }
          }
        }
      }
    }

    // Drift verdicts must carry a coherent discrepancies[] (dimension + values).
    if (DRIFT_VERDICTS.includes(verdict)) {
      const discrepancies = entry.discrepancies;
      if (!Array.isArray(discrepancies) || discrepancies.length === 0) {
        badRows.push(`${key}: verdict=${verdict} requires a non-empty discrepancies[]`);
      } else {
        discrepancies.forEach((d, i) => {
          const dd = d || {};
          // build_value + dimension are always required; prototype_value is
          // required for prototype-class screens (there's a prototype to cite).
          const needsProtoValue = klass === 'prototype';
          if (!present(dd.dimension) || !present(dd.build_value) || (needsProtoValue && !present(dd.prototype_value))) {
            badRows.push(
              `${key}: discrepancy[${i}] must name dimension${needsProtoValue ? ' + prototype_value' : ''} + build_value`,
            );
          }
        });
      }
    }
  }

  if (badRows.length > 0) {
    const first = badRows[0];
    if (badRows.length > 1) {
      return { verdict: `MANIFEST: BAD_ROW (${first}; +${badRows.length - 1} more)`, exitCode: 1 };
    }
    return { verdict: `MANIFEST: BAD_ROW (${first})`, exitCode: 1 };
  }

  return { verdict: 'MANIFEST: VALID', exitCode: 0 };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI entry point — runs only when this file is invoked directly via `node`.
// ───────────────────────────────────────────────────────────────────────────

const isMain = (() => {
  try {
    return (
      typeof process !== 'undefined' &&
      Array.isArray(process.argv) &&
      process.argv[1] &&
      fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
    );
  } catch {
    return false;
  }
})();

if (isMain) {
  const { verdict, exitCode } = validateManifest({
    root: process.argv[2],
    cachePath: process.argv[3],
  });
  process.stdout.write(verdict + '\n');
  process.exit(exitCode);
}
