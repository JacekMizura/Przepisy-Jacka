export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 409;
}

export function readApiError(
  error: unknown,
  fallback = 'Nie udało się wykonać operacji.',
): string {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  if (error instanceof ApiRequestError) {
    return error.message || fallback;
  }
  if (typeof error === 'object' && error !== null) {
    if ('message' in error) {
      const message = error.message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
      if (
        typeof message === 'object' &&
        message !== null &&
        'message' in message &&
        typeof (message as { message: unknown }).message === 'string' &&
        (message as { message: string }).message.length > 0
      ) {
        return (message as { message: string }).message;
      }
      if (Array.isArray(message) && message.length > 0) {
        const parts = message.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        );
        if (parts.length > 0) {
          return parts.join(' ');
        }
      }
    }
    if (
      'error' in error &&
      typeof error.error === 'string' &&
      error.error.length > 0 &&
      error.error !== 'Bad Request'
    ) {
      return error.error;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** Nest ConflictException z `{ code, message, productId }` albo stringiem. */
export function readConflictCode(error: unknown): string | null {
  const body =
    error instanceof ApiRequestError
      ? error.body
      : typeof error === 'object' && error !== null
        ? error
        : null;
  if (!body || typeof body !== 'object') {
    return null;
  }
  if ('code' in body && typeof body.code === 'string') {
    return body.code;
  }
  if (
    'message' in body &&
    typeof body.message === 'object' &&
    body.message !== null &&
    'code' in body.message &&
    typeof (body.message as { code: unknown }).code === 'string'
  ) {
    return (body.message as { code: string }).code;
  }
  return null;
}

export function messageForStatus(status: number, fallback: string): string {
  switch (status) {
    case 401:
      return 'Sesja wygasła. Zaloguj się ponownie.';
    case 403:
      return 'Nie masz uprawnień do tej operacji.';
    case 404:
      return 'Nie znaleziono zasobu.';
    case 409:
      return 'Konflikt danych. Odśwież widok i spróbuj ponownie.';
    case 413:
      return 'Plik jest za duży.';
    case 429:
      return 'Zbyt wiele żądań. Odczekaj chwilę.';
    case 503:
      return 'Usługa chwilowo niedostępna.';
    default:
      if (status >= 500) {
        return 'Błąd serwera. Spróbuj ponownie później.';
      }
      return fallback;
  }
}

/** Status HTTP z wyniku openapi-fetch (omija `never` przy schematach bez 4xx). */
export function apiStatus(result: {
  response: { status: number };
}): number {
  return result.response.status;
}

/**
 * Zwraca `data` albo rzuca ApiRequestError.
 * Przyjmuje luźny kształt wyniku — OpenAPI często dokumentuje tylko 200,
 * więc gałąź `error` bywa typowana jako `never`.
 */
export function requireApiData<T>(
  result: {
    data?: T;
    error?: unknown;
    response: { status: number };
  },
  fallback: string,
): T {
  const status = apiStatus(result);
  if (result.error !== undefined || result.data === undefined) {
    const detail = readApiError(result.error, fallback);
    throw new ApiRequestError(
      status,
      status === 409 ? detail : messageForStatus(status, detail),
      result.error,
    );
  }
  return result.data;
}
