import {
  ApiRequestError,
  apiStatus,
  isConflict,
  isUnauthorized,
  messageForStatus,
  readApiError,
  requireApiData,
} from '@/lib/api-result';

describe('api-result helpers', () => {
  it('detects 401 and 409', () => {
    expect(isUnauthorized(new ApiRequestError(401, 'x'))).toBe(true);
    expect(isConflict(new ApiRequestError(409, 'x'))).toBe(true);
    expect(isUnauthorized(new Error('x'))).toBe(false);
  });

  it('returns data when present', () => {
    const data = requireApiData(
      { data: { id: '1' }, response: { status: 200 } },
      'fail',
    );
    expect(data).toEqual({ id: '1' });
  });

  it('throws ApiRequestError with status message on error branch', () => {
    expect(() =>
      requireApiData(
        { error: { message: 'nope' }, response: { status: 409 } },
        'fallback',
      ),
    ).toThrow(ApiRequestError);

    try {
      requireApiData(
        { error: { message: 'nope' }, response: { status: 409 } },
        'fallback',
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).status).toBe(409);
      expect((error as ApiRequestError).message).toContain('Konflikt');
    }
  });

  it('maps common HTTP statuses', () => {
    expect(messageForStatus(401, 'x')).toMatch(/Sesja/);
    expect(messageForStatus(403, 'x')).toMatch(/uprawnień/);
    expect(messageForStatus(413, 'x')).toMatch(/duży/);
    expect(messageForStatus(429, 'x')).toMatch(/Zbyt wiele/);
    expect(messageForStatus(500, 'x')).toMatch(/serwera/);
    expect(apiStatus({ response: { status: 201 } })).toBe(201);
  });

  it('reads nested API error messages', () => {
    expect(readApiError({ message: ['A', 'B'] }, 'f')).toBe('A B');
  });
});
