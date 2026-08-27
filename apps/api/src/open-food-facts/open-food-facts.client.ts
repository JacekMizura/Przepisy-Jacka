export const OPEN_FOOD_FACTS_CLIENT = Symbol('OPEN_FOOD_FACTS_CLIENT');

export type OffFetchResult =
  | { kind: 'ok'; statusCode: number; body: unknown }
  | { kind: 'rate_limited'; statusCode: number }
  | { kind: 'http_error'; statusCode: number }
  | { kind: 'network_error'; message: string };

export interface OpenFoodFactsClient {
  /**
   * Pobiera publiczne dane produktu po EAN.
   * Nie wolno wysyłać tu danych użytkownika, zdjęć ani innych prywatnych treści.
   */
  fetchProductByEan(ean: string): Promise<OffFetchResult>;
}
