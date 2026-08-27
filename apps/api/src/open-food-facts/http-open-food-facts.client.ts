import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppEnv } from '../config/env';
import {
  type OffFetchResult,
  type OpenFoodFactsClient,
} from './open-food-facts.client';

@Injectable()
export class HttpOpenFoodFactsClient implements OpenFoodFactsClient {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async fetchProductByEan(ean: string): Promise<OffFetchResult> {
    const baseUrl = this.config.get('OPEN_FOOD_FACTS_BASE_URL', {
      infer: true,
    });
    const userAgent = this.config.get('OPEN_FOOD_FACTS_USER_AGENT', {
      infer: true,
    });
    const timeoutMs = this.config.get('OPEN_FOOD_FACTS_TIMEOUT_MS', {
      infer: true,
    });

    const url = new URL(
      `/api/v2/product/${encodeURIComponent(ean)}.json`,
      baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    );
    url.searchParams.set(
      'fields',
      'code,product_name,brands,nutriments,nutrition_data_per',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': userAgent,
        },
        signal: controller.signal,
      });

      if (response.status === 429 || response.status === 503) {
        return { kind: 'rate_limited', statusCode: response.status };
      }

      if (!response.ok) {
        return { kind: 'http_error', statusCode: response.status };
      }

      const body: unknown = await response.json();
      return { kind: 'ok', statusCode: response.status, body };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Nieznany błąd sieci';
      return { kind: 'network_error', message };
    } finally {
      clearTimeout(timer);
    }
  }
}
