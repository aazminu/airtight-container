import 'dotenv/config';
import pg from 'pg';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Forward-only migration runner for `containers_prod` (and local).
//
//   backup (pg_dump)  →  BEGIN  →  apply pending  →  validate(callback)  →  COMMIT
//                                                         │ throws
//                                                         └──────────────→  ROLLBACK
//
// Applied migrations are tracked in a `schema_migrations` table so the
// non-idempotent early migrations (0000–0016) never re-run. The migration
// DDL AND the validation callback run inside ONE transaction: if the
// callback throws, the whole migration rolls back and prod is untouched —
// no restore needed. The pre-migration pg_dump is the catastrophic
// fallback (e.g. a post-COMMIT problem).
//
// Usage:
//   tsx scripts/migrate.ts [--backup-dir DIR] [--check MODULE]
//                          [--baseline VERSION] [--baseline-on-empty VERSION]
//                          [--dry-run] [--no-backup]
//
//   --baseline 0023          record 0000–0023 as applied (do NOT run them),
//                            then exit. One-time adoption of an existing DB.
//   --baseline-on-empty 0023 same, but ONLY when schema_migrations is empty,
//                            then continue and apply anything newer. Safe to
//                            leave in the deploy command: a no-op once adopted.
//   --check MODULE           a module exporting `check(client)` — assertions
//                            run inside the txn; throw to roll the migration back.
//   --dry-run                list pending migrations, change nothing.
//   --no-backup              skip pg_dump (local testing only).
//
// Caveat: statements that cannot run inside a transaction (e.g.
// CREATE INDEX CONCURRENTLY) are unsupported here by design — keep them
// out of migrations, or run them as a separate manual step.

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../db/migrations');

interface Migration {
  version: string;
  file: string;
}

const args = process.argv.slice(2);
const has = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string | null = null): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')
    ? args[i + 1]
    : fallback;
};

const DRY_RUN = has('dry-run');
const NO_BACKUP = has('no-backup');
const BACKUP_DIR = opt('backup-dir', process.env.BACKUP_DIR ?? './backups')!;
const CHECK_MODULE = opt('check');
const BASELINE = opt('baseline');
const BASELINE_ON_EMPTY = opt('baseline-on-empty');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('FATAL: DATABASE_URL is not set.');
  process.exit(1);
}
const REDACTED = DB_URL.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');

const prefix = (version: string) => version.slice(0, 4);
const checksum = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');

function listMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      version: f.replace(/\.sql$/, ''),
      file: path.join(MIGRATIONS_DIR, f),
    }));
}

async function baseline(
  client: pg.Client,
  all: Migration[],
  applied: Map<string, string>,
  version: string,
  dry: boolean,
): Promise<void> {
  const floor = prefix(version);
  const toMark = all.filter(
    (m) => prefix(m.version) <= floor && !applied.has(m.version),
  );
  for (const m of toMark) {
    if (!dry) {
      await client.query(
        `INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)
         ON CONFLICT (version) DO NOTHING`,
        [m.version, checksum(m.file)],
      );
    }
    applied.set(m.version, '');
  }
  console.log(
    `baseline${dry ? ' (dry-run)' : ''}: marked ${toMark.length} migration(s) ` +
      `<= ${floor} as already-applied (NOT run).`,
  );
}

// Never baseline a fresh/empty database — that would silently skip migrations
// that genuinely need to run. The two tables 0024 alters must already exist.
async function assertBaselineSentinel(client: pg.Client): Promise<void> {
  const { rows } = await client.query(
    `SELECT to_regclass('public.quote_line_modifications') AS a,
            to_regclass('public.sold_modifications')       AS b`,
  );
  if (!rows[0].a || !rows[0].b) {
    throw new Error(
      'baseline-on-empty refused: expected tables are missing — this does not ' +
        'look like the established schema. Migrate from scratch instead of baselining.',
    );
  }
}

function backup(): string {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `prod-${ts}.sql`);
  console.log(`  backing up ${REDACTED} -> ${file}`);
  execFileSync(
    'pg_dump',
    ['--dbname', DB_URL!, '--no-owner', '--no-privileges', '-f', file],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  console.log('  backup complete.');
  return file;
}

async function main(): Promise<void> {
  const all = listMigrations();
  console.log(`migrate: ${all.length} migration files, target ${REDACTED}`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const res = await client.query('SELECT version, checksum FROM schema_migrations');
    const applied = new Map<string, string>(
      res.rows.map((r) => [r.version, r.checksum]),
    );

    for (const m of all) {
      if (applied.has(m.version) && applied.get(m.version) !== checksum(m.file)) {
        console.warn(
          `WARN: applied migration ${m.version} differs from disk (checksum drift).`,
        );
      }
    }

    if (BASELINE) {
      await baseline(client, all, applied, BASELINE, DRY_RUN);
      console.log('baseline done; not applying migrations.');
      return;
    }

    if (BASELINE_ON_EMPTY && applied.size === 0) {
      await assertBaselineSentinel(client);
      await baseline(client, all, applied, BASELINE_ON_EMPTY, DRY_RUN);
    }

    const pending = all.filter((m) => !applied.has(m.version));
    if (pending.length === 0) {
      console.log('Up to date — no pending migrations.');
      return;
    }
    console.log(`Pending (${pending.length}): ${pending.map((m) => m.version).join(', ')}`);
    if (DRY_RUN) {
      console.log('--dry-run: nothing applied.');
      return;
    }

    const backupPath = NO_BACKUP ? null : backup();
    if (NO_BACKUP) console.log('  --no-backup: skipping pg_dump.');

    let check: ((c: pg.Client) => Promise<void>) | null = null;
    if (CHECK_MODULE) {
      const mod = await import(path.resolve(CHECK_MODULE));
      check = mod.check ?? mod.default;
      if (typeof check !== 'function') {
        throw new Error(`--check ${CHECK_MODULE} exports no check() function`);
      }
    }

    try {
      await client.query('BEGIN');
      for (const m of pending) {
        console.log(`  applying ${m.version} ...`);
        await client.query(readFileSync(m.file, 'utf8'));
        await client.query(
          'INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)',
          [m.version, checksum(m.file)],
        );
      }
      if (check) {
        console.log('  running validation callback ...');
        await check(client);
        console.log('  validation passed.');
      }
      await client.query('COMMIT');
      console.log(`COMMIT — applied ${pending.length} migration(s).`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(
        '\nERROR during migrate/validate — ROLLED BACK; no schema change persisted.',
      );
      console.error(err instanceof Error ? err.stack : String(err));
      if (backupPath) console.error(`Pre-migration backup retained: ${backupPath}`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
