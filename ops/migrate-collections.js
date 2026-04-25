#!/usr/bin/env node
/**
 * migrate-collections.js — Safe MongoDB migration tool for Sprint 3
 *
 * Usage (CLI):
 *   node /app/ops/migrate-collections.js --dry-run      # show plan, no writes
 *   node /app/ops/migrate-collections.js --apply        # copy source → target (no drop)
 *   node /app/ops/migrate-collections.js --apply-drop   # copy AND drop source afterwards
 *
 * Safety rules:
 *   • no drop without --apply-drop
 *   • refuse to copy if target is non-empty (use --force-overwrite to override)
 *   • always prints source/target counts before anything
 *   • logs every operation
 *
 * Run requirements:  mongosh must be on PATH, MONGO_URL/DB_NAME from env or default.
 */

const { spawnSync } = require('child_process');

const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'auto_platform';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || (!args.includes('--apply') && !args.includes('--apply-drop'));
const APPLY = args.includes('--apply') || args.includes('--apply-drop');
const DROP = args.includes('--apply-drop');
const FORCE = args.includes('--force-overwrite');

// ─── Migration plan ───
// Each item:
//   { source: camelCase, target: snake_case, strategy: 'migrate'|'drop-if-empty', note: '…' }
const PLAN = [
  // No real data drift right now (all camelCase dupes are empty).
  // These are candidates for drop-if-empty (safe cleanup).
  { source: 'audits',                 target: 'audit_logs',   strategy: 'drop-if-empty', note: 'Legacy alias; canonical=audit_logs' },
  { source: 'geozones',               target: 'zones',        strategy: 'drop-if-empty', note: 'Old NestJS GeoZone; canonical=zones (FastAPI engine)' },
  // These are different CONCEPTS (not dupes) — never drop automatically, only document:
  // provideravailabilities   ≠ provider_availability
  // providerlivelocations    ≠ provider_locations
  // providerservices         ≠ provider_skills
  // If future data appears in these, it's a legit NestJS feature write.
];

function mongosh(script) {
  const res = spawnSync('mongosh', ['--quiet', `${MONGO_URL}/${DB_NAME}`, '--eval', script], {
    encoding: 'utf-8',
  });
  if (res.status !== 0) {
    throw new Error(`mongosh failed: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

function count(col) {
  return parseInt(mongosh(`print(db.${col}.countDocuments())`), 10) || 0;
}

function dropCollection(col) {
  return mongosh(`print(db.${col}.drop())`);
}

function copy(source, target) {
  const script = `
    const cur = db.${source}.find();
    let copied = 0;
    while (cur.hasNext()) {
      const doc = cur.next();
      delete doc._id;
      db.${target}.insertOne(doc);
      copied++;
    }
    print(copied);
  `;
  return parseInt(mongosh(script), 10) || 0;
}

function banner(text) {
  console.log('\n' + '═'.repeat(70));
  console.log(text);
  console.log('═'.repeat(70));
}

(async () => {
  banner(`MongoDB migration plan — DB=${DB_NAME} mode=${DRY_RUN ? 'DRY-RUN' : (DROP ? 'APPLY+DROP' : 'APPLY')}`);

  let planned = 0, executed = 0, dropped = 0, skipped = 0;

  for (const item of PLAN) {
    const srcCount = count(item.source);
    const tgtCount = count(item.target);
    console.log(`\n→ ${item.source}  (${srcCount} docs)  →  ${item.target}  (${tgtCount} docs)`);
    console.log(`  strategy=${item.strategy}  ${item.note ? '— ' + item.note : ''}`);

    if (item.strategy === 'drop-if-empty') {
      if (srcCount === 0) {
        if (DRY_RUN) {
          console.log(`  [dry-run] would drop empty '${item.source}'`);
        } else if (DROP) {
          const r = dropCollection(item.source);
          console.log(`  ✓ dropped '${item.source}' → ${r}`);
          dropped++;
        } else {
          console.log(`  (--apply without --apply-drop: not dropping; use --apply-drop to remove)`);
          skipped++;
        }
      } else {
        console.log(`  ✗ '${item.source}' is NOT empty — refusing to drop. Change strategy to 'migrate'.`);
        skipped++;
      }
      continue;
    }

    if (item.strategy === 'migrate') {
      if (srcCount === 0) {
        console.log(`  (source empty — nothing to migrate)`);
        skipped++;
        continue;
      }
      if (tgtCount > 0 && !FORCE) {
        console.log(`  ✗ target '${item.target}' not empty (${tgtCount}). Use --force-overwrite to proceed.`);
        skipped++;
        continue;
      }
      planned++;
      if (DRY_RUN) {
        console.log(`  [dry-run] would copy ${srcCount} docs ${item.source} → ${item.target}`);
      } else {
        const copied = copy(item.source, item.target);
        console.log(`  ✓ copied ${copied} docs`);
        executed++;
        if (DROP) {
          dropCollection(item.source);
          console.log(`  ✓ dropped source '${item.source}'`);
          dropped++;
        }
      }
    }
  }

  banner(`Summary — planned: ${planned}, executed: ${executed}, dropped: ${dropped}, skipped: ${skipped}`);
  if (DRY_RUN) {
    console.log('This was a DRY-RUN. Run with --apply or --apply-drop to execute.');
  }
})();
