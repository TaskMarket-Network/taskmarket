#!/usr/bin/env node

const MIN_NODE_MAJOR = 22;
const MIN_PNPM_MAJOR = 9;

const nodeVersion = process.versions.node;
const nodeMajor = Number(nodeVersion.split('.')[0]);

const userAgent = process.env.npm_config_user_agent ?? '';
const pnpmMatch = userAgent.match(/pnpm\/(\d+)/);
const pnpmVersion = pnpmMatch?.[1];
const pnpmMajor = pnpmVersion ? Number(pnpmVersion) : Number.NaN;

function fail(message) {
  console.error(`[preflight] ${message}`);
  process.exit(1);
}

if (Number.isNaN(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
  fail(`Node.js ${MIN_NODE_MAJOR}+ is required; detected Node.js ${nodeVersion}.`);
}

if (!pnpmMatch) {
  fail('pnpm is required; install it and retry (see https://pnpm.io/installation).');
}

if (Number.isNaN(pnpmMajor) || pnpmMajor < MIN_PNPM_MAJOR) {
  fail(`pnpm ${MIN_PNPM_MAJOR}+ is required; detected pnpm ${pnpmVersion}.`);
}

console.log(`[preflight] OK - Node.js ${nodeVersion}, pnpm ${pnpmVersion}`);
