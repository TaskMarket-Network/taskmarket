#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { pathToFileURL } from 'node:url';

import { parseEnv } from './check-env.mjs';

const ENV_PATH = new URL('../.env', import.meta.url);

const DEFAULT_PORTS = {
  postgres: 5432,
  postgresql: 5432,
  redis: 6379,
  rediss: 6379,
};

export function parseConnectionString(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const scheme = parsed.protocol.replace(/:$/, '');
  if (!DEFAULT_PORTS[scheme]) {
    return null;
  }
  const port = parsed.port ? Number(parsed.port) : DEFAULT_PORTS[scheme];
  const database = parsed.pathname ? parsed.pathname.replace(/^\//, '') : null;
  return { scheme, host: parsed.hostname, port, database };
}

export function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const done = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    return {};
  }
  return parseEnv(readFileSync(ENV_PATH, 'utf8'));
}

function describeService(name, info) {
  const { scheme, host, port } = info;
  return { name, scheme, host, port };
}

async function main() {
  const env = loadEnv();

  const services = [];

  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl) {
    const info = parseConnectionString(databaseUrl);
    if (info) {
      services.push(describeService('postgres', info));
    }
  } else {
    services.push({
      name: 'postgres',
      scheme: 'postgres',
      host: env.POSTGRES_HOST || 'localhost',
      port: Number(env.POSTGRES_PORT) || DEFAULT_PORTS.postgres,
    });
  }

  const redisUrl = env.REDIS_URL;
  if (redisUrl) {
    const info = parseConnectionString(redisUrl);
    if (info) {
      services.push(describeService('redis', info));
    }
  } else {
    services.push({
      name: 'redis',
      scheme: 'redis',
      host: env.REDIS_HOST || 'localhost',
      port: Number(env.REDIS_PORT) || DEFAULT_PORTS.redis,
    });
  }

  const results = [];
  for (const service of services) {
    const ok = await tcpProbe(service.host, service.port);
    results.push({ ...service, ok });
  }

  let allOk = true;
  for (const result of results) {
    const status = result.ok ? 'reachable' : 'unreachable';
    console.log(
      `[db-check] ${result.name} ${result.scheme}://${result.host}:${result.port} - ${status}`,
    );
    if (!result.ok) {
      allOk = false;
    }
  }

  if (allOk) {
    console.log('[db-check] OK - local database services are reachable.');
    process.exit(0);
  }

  console.log('[db-check] local database services are not reachable.');
  console.log('[db-check] start them with `pnpm db:up` (requires Docker), then rerun this check.');
  process.exit(1);
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main();
}
