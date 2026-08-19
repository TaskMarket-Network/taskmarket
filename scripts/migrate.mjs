#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import pg from 'pg';

import { parseEnv } from './check-env.mjs';

const ENV_PATH = new URL('../.env', import.meta.url);
const MIGRATIONS_DIR = new URL('../packages/agent-registry/migrations/', import.meta.url);

/** Migration SQL files, sorted in application order. */
export function listMigrationFiles(dir = MIGRATIONS_DIR) {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

/** Migration files that have not yet been applied. */
export function pendingMigrations(appliedVersions, files) {
  const applied = new Set(appliedVersions);
  return files.filter((file) => !applied.has(file));
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
    console.error('[migrate] no migration files found under packages/agent-registry/migrations.');
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

    for (const file of pending) {
      const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
        console.log(`[migrate] applied ${file}`);
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
