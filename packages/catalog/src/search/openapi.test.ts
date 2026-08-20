import { describe, expect, it } from 'vitest';

import { buildMarketplaceCatalogSearchOpenApi } from './openapi.js';

interface SearchPath {
  post: {
    operationId: string;
    requestBody: {
      content: { 'application/json': { schema: { $ref: string } } };
    };
  };
}

describe('buildMarketplaceCatalogSearchOpenApi', () => {
  it('builds a 3.1 document with a single search path', () => {
    const openapi = buildMarketplaceCatalogSearchOpenApi();
    expect(openapi.openapi).toBe('3.1.0');
    expect(openapi.info.title).toBe('TaskMarket Marketplace Search');
    const path = openapi.paths['/listings/search'] as SearchPath;
    expect(path.post.operationId).toBe('searchListings');
  });

  it('derives schemas from the validated query and result schemas', () => {
    const openapi = buildMarketplaceCatalogSearchOpenApi();
    const schemas = openapi.components.schemas;
    expect(schemas.MarketplaceSearchQuery).toBeDefined();
    expect(schemas.MarketplaceSearchResult).toBeDefined();
    expect(schemas.MarketplaceSearchItem).toBeDefined();
    expect(schemas.MarketplaceSearchError).toBeDefined();
    const path = openapi.paths['/listings/search'] as SearchPath;
    expect(path.post.requestBody.content['application/json'].schema.$ref).toBe(
      '#/components/schemas/MarketplaceSearchQuery',
    );
  });

  it('applies service options', () => {
    const openapi = buildMarketplaceCatalogSearchOpenApi({
      serviceName: 'Custom',
      baseUrl: 'https://api.example.com',
    });
    expect(openapi.info.title).toBe('Custom');
    expect(openapi.servers).toEqual([{ url: 'https://api.example.com' }]);
  });
});
