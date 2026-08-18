#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EXAMPLE_ENV_PATH = new URL('../.env.example', import.meta.url);
const ENV_PATH = new URL('../.env', import.meta.url);

const PLACEHOLDER_PATTERN = /(change_me|changeme|your_|your-key|xxx|example\.com|placeholder)/i;
const PRIVATE_KEY_PATTERN = /(^|\W)(0x[0-9a-fA-F]{64})(\W|$)/;

export function parseEnv(text) {
  const vars = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }
    vars[key] = value;
  }
  return vars;
}

export function validateEnv({ example = '', env = {} }) {
  const errors = [];
  const warnings = [];

  if (env.NODE_ENV === 'production' && env.ALLOW_PRODUCTION !== '1') {
    errors.push(
      'NODE_ENV=production is set; local development must use safe, testnet-oriented defaults.',
    );
  }

  for (const [key, defaultValue] of Object.entries(parseEnv(example))) {
    const value = env[key];
    if (value === undefined) {
      warnings.push(
        `${key} is not set; using the safe default from .env.example (${defaultValue}).`,
      );
      continue;
    }
    if (PLACEHOLDER_PATTERN.test(value)) {
      warnings.push(`${key} looks like a placeholder value; replace it before connecting.`);
    }
  }

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('PLACEHOLDER_')) {
      continue;
    }
    if (PRIVATE_KEY_PATTERN.test(value)) {
      errors.push(
        `${key} appears to contain a private key; private keys must come from a secrets manager, never .env.`,
      );
    }
  }

  return { errors, warnings };
}

function main() {
  const exampleExists = existsSync(EXAMPLE_ENV_PATH);
  const envExists = existsSync(ENV_PATH);

  if (!envExists) {
    console.log('[check-env] no .env file detected; using safe local development defaults.');
    process.exit(0);
  }

  const example = exampleExists ? readFileSync(EXAMPLE_ENV_PATH, 'utf8') : '';
  const env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
  const { errors, warnings } = validateEnv({ example, env });

  for (const warning of warnings) {
    console.warn(`[check-env] warning: ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[check-env] error: ${error}`);
    }
    console.error('[check-env] environment is not safe for local development; fix and rerun.');
    process.exit(1);
  }

  console.log('[check-env] OK - environment uses safe local development defaults.');
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main();
}
