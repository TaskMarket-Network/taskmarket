#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { parseEnv } from './check-env.mjs';

const ENV_PATH = new URL('../.env', import.meta.url);
const PACKAGES_DIR = new URL('../packages/', import.meta.url);

/**
 * Migration SQL files across all packages, sorted in application order. Each
 * entry is `{ version, dir, file }` where `version` is the package-relative
 * path (e.g. `agent-registry/001_agent_registry.sql`).
 */
export function listMigrationFiles() {
  const migrations = [];
  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = new URL(`${entry.name}/migrations/`, PACKAGES_DIR);
    if (!existsSync(dir)) {
      continue;
    }
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      migrations.push({ version: `${entry.name}/${file}`, dir, file });
    }
  }
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return migrations;
}

/**
 * Migration entries that have not yet been applied. Matches against the
 * package-relative version and the legacy basename, so migrations recorded
 * before multi-package scanning are not re-run.
 */
export function pendingMigrations(appliedVersions, files) {
  const applied = new Set(appliedVersions);
  return files.filter((entry) => !applied.has(entry.version) && !applied.has(entry.file));
}

function loadEnv() {
  const fileEnv = existsSync(ENV_PATH) ? parseEnv(readFileSync(ENV_PATH, 'utf8')) : {};
  return { ...fileEnv, ...process.env };
}

async function main() {
  const env = loadEnv();
  const databaseUrl =
    env.DATABASE_URL ?? 'postgres://taskmarket_dev:taskmarket_dev@localhost:5432/taskmarket_dev';
  if (env.DATABASE_URL === undefined) {
    console.log('[migrate] DATABASE_URL not set; using the safe local development default.');
  }

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.error('[migrate] no migration files found under packages/*/migrations.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query(`
      create table if not exists schema_migrations (
        version text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query('select version from schema_migrations');
    const pending = pendingMigrations(
      rows.map((row) => row.version),
      files,
    );

    if (pending.length === 0) {
      console.log('[migrate] no pending migrations.');
      return;
    }

    for (const entry of pending) {
      const sql = readFileSync(new URL(entry.file, entry.dir), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [entry.version]);
        await client.query('commit');
        console.log(`[migrate] applied ${entry.version}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log(`[migrate] OK - applied ${pending.length} migration(s).`);
  } catch (error) {
    console.error(`[migrate] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main();
}
