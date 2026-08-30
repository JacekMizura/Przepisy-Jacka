import { BadRequestException } from '@nestjs/common';

import {
  parsePositivePackageCount,
  totalPriceMinorFromPackages,
} from './package-price';

describe('package-price', () => {
  it('2 × 125 g count is integer 2', () => {
    expect(parsePositivePackageCount('2')).toBe(2);
  });

  it('2 × 2,99 zł = 5,98 zł in grosze', () => {
    // 2,99 zł = 299 groszy
    expect(totalPriceMinorFromPackages(299, 2)).toBe(598);
  });

  it('rejects non-integer packageCount', () => {
    expect(() => parsePositivePackageCount('1.5')).toThrow(BadRequestException);
    expect(() => parsePositivePackageCount('0')).toThrow(BadRequestException);
  });

  it('rejects negative package price', () => {
    expect(() => totalPriceMinorFromPackages(-1, 2)).toThrow(
      BadRequestException,
    );
  });
});
