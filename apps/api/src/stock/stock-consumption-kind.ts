import { BadRequestException } from '@nestjs/common';

import {
  STOCK_CONSUMPTION_REASON_MAX_LENGTH,
  type StockConsumptionKindValue,
} from './dto/stock-consume.dto';

export function resolveStockConsumptionKindAndReason(input: {
  kind?: StockConsumptionKindValue;
  reason?: string | null;
}): { kind: StockConsumptionKindValue; reason: string | null } {
  const kind: StockConsumptionKindValue = input.kind ?? 'consume';
  const reason =
    typeof input.reason === 'string' && input.reason.trim().length > 0
      ? input.reason.trim()
      : null;

  if (reason && reason.length > STOCK_CONSUMPTION_REASON_MAX_LENGTH) {
    throw new BadRequestException(
      `Powód może mieć maksymalnie ${STOCK_CONSUMPTION_REASON_MAX_LENGTH} znaków.`,
    );
  }

  if (kind === 'write_off') {
    if (!reason) {
      throw new BadRequestException('Powód odpisu jest wymagany.');
    }
    return { kind, reason };
  }

  return { kind: 'consume', reason };
}
