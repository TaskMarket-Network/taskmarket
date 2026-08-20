import { describe, expect, it } from 'vitest';

import { buildMarketplaceCatalogOpenApi } from './openapi.js';
import { MARKETPLACE_CATALOG_API_VERSION } from './version.js';

describe('buildMarketplaceCatalogOpenApi', () => {
  it('builds an OpenAPI 3.1 document with one endpoint per action', () => {
    const document = buildMarketplaceCatalogOpenApi();
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.version).toBe(MARKETPLACE_CATALOG_API_VERSION);
    const paths = Object.keys(document.paths).sort();
    expect(paths).toEqual([
      '/listings/create',
      '/listings/delist',
      '/listings/get',
      '/listings/list',
      '/listings/pause',
      '/listings/publish',
      '/listings/update',
    ]);
    expect(document.components.schemas.MarketplaceListing).toBeDefined();
    expect(document.components.schemas['Payload.Create']).toBeDefined();
  });

  it('reflects service options and baseUrl', () => {
    const document = buildMarketplaceCatalogOpenApi({
      serviceName: 'Dev Catalog',
      serviceVersion: '9.9.9',
      baseUrl: 'https://catalog.example.test',
    });
    expect(document.info.title).toBe('Dev Catalog');
    expect(document.info.version).toBe('9.9.9');
    expect(document.servers).toEqual([{ url: 'https://catalog.example.test' }]);
  });

  it('uses the Lifecycle payload for publish/pause/delist operations', () => {
    const document = buildMarketplaceCatalogOpenApi();
    for (const action of ['publish', 'pause', 'delist']) {
      const requestName = `Operation.${action}.Request`;
      const schema = document.components.schemas[requestName] as {
        properties?: { payload?: { $ref?: string } };
      };
      expect(schema?.properties?.payload?.$ref).toBe('#/components/schemas/Payload.Lifecycle');
    }
  });
});
