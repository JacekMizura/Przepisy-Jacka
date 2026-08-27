import { Injectable } from '@nestjs/common';

import {
  type OffFetchResult,
  type OpenFoodFactsClient,
} from './open-food-facts.client';
import { type OffProductPayload } from './map-off-product';

/**
 * Sterownik testowy: odpowiedzi kontrolowane przez mapę EAN → wynik.
 * Używany gdy OPEN_FOOD_FACTS_DRIVER=fixture.
 */
@Injectable()
export class FixtureOpenFoodFactsClient implements OpenFoodFactsClient {
  private readonly fixtures = new Map<string, OffFetchResult>();

  seed(ean: string, result: OffFetchResult): void {
    this.fixtures.set(ean, result);
  }

  seedOk(ean: string, body: OffProductPayload): void {
    this.fixtures.set(ean, { kind: 'ok', statusCode: 200, body });
  }

  clear(): void {
    this.fixtures.clear();
  }

  fetchProductByEan(ean: string): Promise<OffFetchResult> {
    const fixture = this.fixtures.get(ean);
    if (!fixture) {
      return Promise.resolve({
        kind: 'ok',
        statusCode: 200,
        body: { status: 0, status_verbose: 'product not found' },
      });
    }
    return Promise.resolve(fixture);
  }
}
