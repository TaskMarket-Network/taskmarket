import { describe, expect, it } from 'vitest';

const MIN_NODE_MAJOR = 22;

describe('test environment sanity', () => {
  it('runs on Node.js 22 or newer', () => {
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    expect(nodeMajor).toBeGreaterThanOrEqual(MIN_NODE_MAJOR);
  });

  it('supports standard assertion behavior', () => {
    expect(1 + 1).toBe(2);
  });
});
