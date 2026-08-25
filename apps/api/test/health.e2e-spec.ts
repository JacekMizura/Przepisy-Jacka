import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

function isHealthBody(
  value: unknown,
): value is { status: string; timestamp: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('status' in value) || !('timestamp' in value)) {
    return false;
  }

  return (
    typeof value.status === 'string' && typeof value.timestamp === 'string'
  );
}

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3001';
    process.env.DATABASE_URL =
      'postgresql://moja_kuchnia:moja_kuchnia_dev@localhost:5432/moja_kuchnia';
    process.env.CORS_ORIGINS = 'http://localhost:3000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns service status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);

    const body: unknown = JSON.parse(response.body) as unknown;
    expect(isHealthBody(body)).toBe(true);
    if (!isHealthBody(body)) {
      return;
    }

    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });
});
