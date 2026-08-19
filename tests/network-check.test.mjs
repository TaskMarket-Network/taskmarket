import { describe, expect, it } from 'vitest';

import { parseHexQuantity } from '../scripts/check-goat-network.mjs';

describe('parseHexQuantity', () => {
  it('parses a hex quantity', () => {
    expect(parseHexQuantity('0x1')).toBe(1);
    expect(parseHexQuantity('0xBEB0')).toBe(48816);
    expect(parseHexQuantity('0x929')).toBe(2345);
    expect(parseHexQuantity('0x0')).toBe(0);
  });

  it('accepts lowercase hex', () => {
    expect(parseHexQuantity('0xbeb0')).toBe(48816);
  });

  it('returns null for invalid input', () => {
    expect(parseHexQuantity('not-hex')).toBeNull();
    expect(parseHexQuantity('BEB0')).toBeNull();
    expect(parseHexQuantity('0x')).toBeNull();
    expect(parseHexQuantity(48816)).toBeNull();
    expect(parseHexQuantity(null)).toBeNull();
    expect(parseHexQuantity(undefined)).toBeNull();
  });
});
