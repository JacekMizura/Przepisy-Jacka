import { HealthService } from './health.service';

describe('HealthService', () => {
  it('returns ok status and an ISO timestamp', () => {
    const service = new HealthService();
    const result = service.getHealth();

    expect(result.status).toBe('ok');
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
