import { apiFetch, startApiServer, type RunningApi } from './create-api-app';

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
  let api: RunningApi;

  beforeAll(async () => {
    api = await startApiServer();
  });

  afterAll(() => {
    api.stop();
  });

  it('GET /api/health returns service status', async () => {
    const response = await apiFetch(api.origin, '/api/health', {
      webOrigin: 'http://127.0.0.1:3010',
    });
    expect(response.status).toBe(200);
    expect(isHealthBody(response.body)).toBe(true);
    if (!isHealthBody(response.body)) {
      return;
    }
    expect(response.body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});
