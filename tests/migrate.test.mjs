import { describe, expect, it } from 'vitest';

import { listMigrationFiles, pendingMigrations } from '../scripts/migrate.mjs';

describe('listMigrationFiles', () => {
  it('discovers the registry migration in sorted order', () => {
    const files = listMigrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files[0]).toBe('001_agent_registry.sql');
    expect(files.every((file) => file.endsWith('.sql'))).toBe(true);
  });
});

describe('pendingMigrations', () => {
  it('returns only migrations not yet applied', () => {
    const files = ['001_a.sql', '002_b.sql', '003_c.sql'];
    expect(pendingMigrations([], files)).toEqual(files);
    expect(pendingMigrations(['001_a.sql'], files)).toEqual(['002_b.sql', '003_c.sql']);
    expect(pendingMigrations(files, files)).toEqual([]);
  });

  it('ignores applied versions not present in the file list', () => {
    const files = ['001_a.sql'];
    expect(pendingMigrations(['001_a.sql', '002_b.sql'], files)).toEqual([]);
  });
});
