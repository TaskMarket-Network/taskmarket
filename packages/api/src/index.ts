import Fastify from 'fastify';

export async function createApiServer(): Promise<Fastify.FastifyInstance> {
  const app = Fastify({ logger: false });

  // Health check route
  app.get('/health', async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });

  // Status route
  app.get('/status', async () => {
    return { status: 'ok', service: 'marketplace-api' };
  });

  // Placeholder for marketplace core routes
  // Will be expanded in subsequent Phase 4 steps
  app.get('/listings', async () => {
    return { ok: true, listings: [] };
  });

  app.get('/offerings', async () => {
    return { ok: true, offerings: [] };
  });

  return app;
}