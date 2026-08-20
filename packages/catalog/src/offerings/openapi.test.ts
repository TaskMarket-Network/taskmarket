import { describe, expect, it } from 'vitest';

import { buildServiceOfferingOpenApi } from './openapi.js';
import { SERVICE_OFFERING_API_VERSION } from './version.js';

describe('buildServiceOfferingOpenApi', () => {
  it('builds an OpenAPI 3.1 document with one POST path per action', () => {
    const doc = buildServiceOfferingOpenApi();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe(SERVICE_OFFERING_API_VERSION);
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/offerings/activate',
      '/offerings/archive',
      '/offerings/create',
      '/offerings/get',
      '/offerings/list',
      '/offerings/update',
    ]);
  });

  it('uses the supplied info options and baseUrl', () => {
    const doc = buildServiceOfferingOpenApi({
      serviceName: 'My Offerings',
      serviceVersion: '2.0.0',
      serviceDescription: 'desc',
      baseUrl: 'https://api.example.com',
    });
    expect(doc.info.title).toBe('My Offerings');
    expect(doc.info.version).toBe('2.0.0');
    expect(doc.info.description).toBe('desc');
    expect(doc.servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('references the typed offering schema in the response components', () => {
    const doc = buildServiceOfferingOpenApi();
    expect(doc.components.schemas.ServiceOffering).toBeDefined();
    expect(doc.components.schemas['Payload.Create']).toBeDefined();
    expect(doc.components.schemas['Payload.Lifecycle']).toBeDefined();
  });
});
