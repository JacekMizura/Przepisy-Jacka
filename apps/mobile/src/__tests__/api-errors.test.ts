import { ApiRequestError, isConflict, isUnauthorized } from '@/lib/api-result';

describe('api errors', () => {
  it('detects 401 and 409', () => {
    expect(isUnauthorized(new ApiRequestError(401, 'x'))).toBe(true);
    expect(isConflict(new ApiRequestError(409, 'x'))).toBe(true);
    expect(isUnauthorized(new Error('x'))).toBe(false);
  });
});
