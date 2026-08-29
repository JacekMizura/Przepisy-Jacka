import { Prisma } from '../generated/prisma/client';

/** Identyfikatory nutrientów USDA (nutrient.id w JSON / nutrient_nbr w CSV bywa inny). */
export const USDA_NUTRIENT = {
  energyKcal: 1008,
  energyKj: 1009,
  protein: 1003,
  fat: 1004,
  carbByDifference: 1005,
  fiber: 1079,
  sodium: 1093,
  energyAtwaterGeneral: 2047,
  energyAtwaterSpecific: 2048,
} as const;

export type UsdaNutrientReading = {
  nutrientId: number;
  amount: number | null;
  unitName: string | null;
};

export type MappedUsdaNutrition = {
  kcal: Prisma.Decimal | null;
  energyField:
    | '2048_atwater_specific'
    | '2047_atwater_general'
    | '1008_energy_kcal'
    | '1009_energy_kj_converted'
    | null;
  proteinGrams: Prisma.Decimal | null;
  fatGrams: Prisma.Decimal | null;
  carbsGrams: Prisma.Decimal | null;
  carbsMethod:
    | 'available_approx_carb_minus_fiber'
    | 'carb_by_difference_includes_fiber'
    | null;
  carbsApproximate: boolean;
  fiberGrams: Prisma.Decimal | null;
  saltGrams: Prisma.Decimal | null;
  sodiumMg: Prisma.Decimal | null;
  warnings: string[];
  incomplete: boolean;
};

function d(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(3));
}

function readAmount(
  readings: UsdaNutrientReading[],
  nutrientId: number,
): { amount: number; unitName: string | null } | null {
  const hit = readings.find((r) => r.nutrientId === nutrientId);
  if (!hit || hit.amount === null || hit.amount === undefined) {
    return null;
  }
  if (!Number.isFinite(hit.amount)) {
    return null;
  }
  return { amount: hit.amount, unitName: hit.unitName };
}

/**
 * Mapuje nutrienty USDA po ID (nie po kolejności).
 * Energia: 2048 → 2047 → 1008; kJ (1009) tylko gdy brak kcal.
 * Węglowodany: preferuj (1005 − 1079) jako przybliżone „available”;
 * bez błonnika nie podstawiamy 0 — zostaje 1005 z flagą includes_fiber.
 * Sól = sód_mg × 2,5 / 1000; brak sodu → sól null.
 */
export function mapUsdaNutrients(
  readings: UsdaNutrientReading[],
): MappedUsdaNutrition {
  const warnings: string[] = [];

  let kcal: Prisma.Decimal | null = null;
  let energyField: MappedUsdaNutrition['energyField'] = null;

  const specific = readAmount(readings, USDA_NUTRIENT.energyAtwaterSpecific);
  const general = readAmount(readings, USDA_NUTRIENT.energyAtwaterGeneral);
  const energyKcal = readAmount(readings, USDA_NUTRIENT.energyKcal);
  const energyKj = readAmount(readings, USDA_NUTRIENT.energyKj);

  if (specific) {
    kcal = d(specific.amount);
    energyField = '2048_atwater_specific';
  } else if (general) {
    kcal = d(general.amount);
    energyField = '2047_atwater_general';
  } else if (energyKcal) {
    kcal = d(energyKcal.amount);
    energyField = '1008_energy_kcal';
  } else if (energyKj) {
    kcal = d(energyKj.amount / 4.184);
    energyField = '1009_energy_kj_converted';
    warnings.push(
      'Energia przeliczona z kJ (nutrient 1009) na kcal (÷ 4,184) — brak pola kcal w źródle.',
    );
  } else {
    warnings.push('Brak wartości energii (kcal/kJ) w źródle USDA.');
  }

  const protein = readAmount(readings, USDA_NUTRIENT.protein);
  const fat = readAmount(readings, USDA_NUTRIENT.fat);
  const carb = readAmount(readings, USDA_NUTRIENT.carbByDifference);
  const fiber = readAmount(readings, USDA_NUTRIENT.fiber);
  const sodium = readAmount(readings, USDA_NUTRIENT.sodium);

  const proteinGrams = protein ? d(protein.amount) : null;
  const fatGrams = fat ? d(fat.amount) : null;
  if (!protein) warnings.push('Brak białka w źródle USDA.');
  if (!fat) warnings.push('Brak tłuszczu w źródle USDA.');

  let carbsGrams: Prisma.Decimal | null = null;
  let carbsMethod: MappedUsdaNutrition['carbsMethod'] = null;
  let carbsApproximate = false;
  let fiberGrams: Prisma.Decimal | null = null;

  if (fiber) {
    fiberGrams = d(fiber.amount);
  }

  if (carb && fiber) {
    const available = carb.amount - fiber.amount;
    if (available < 0) {
      warnings.push(
        'Węglowodany po odjęciu błonnika wyszły ujemne — odrzucono wyliczenie.',
      );
      carbsGrams = null;
      carbsMethod = null;
    } else {
      carbsGrams = d(available);
      carbsMethod = 'available_approx_carb_minus_fiber';
      carbsApproximate = true;
      warnings.push(
        'Węglowodany zapisano jako przybliżone (carbohydrate-by-difference minus fiber).',
      );
    }
  } else if (carb) {
    carbsGrams = d(carb.amount);
    carbsMethod = 'carb_by_difference_includes_fiber';
    carbsApproximate = true;
    warnings.push(
      'Brak błonnika w źródle — zapisano carbohydrate-by-difference (obejmuje błonnik); nie podstawiono zera błonnika.',
    );
  } else {
    warnings.push('Brak węglowodanów w źródle USDA.');
  }

  let saltGrams: Prisma.Decimal | null = null;
  let sodiumMg: Prisma.Decimal | null = null;
  if (sodium) {
    sodiumMg = d(sodium.amount);
    saltGrams = d((sodium.amount * 2.5) / 1000);
  }

  const incomplete =
    kcal === null ||
    proteinGrams === null ||
    fatGrams === null ||
    carbsGrams === null;

  return {
    kcal,
    energyField,
    proteinGrams,
    fatGrams,
    carbsGrams,
    carbsMethod,
    carbsApproximate,
    fiberGrams,
    saltGrams,
    sodiumMg,
    warnings,
    incomplete,
  };
}

/** Skaluje wartości na 100 g → na `pieceGrams` g (1 szt. części jadalnej). */
export function scaleNutritionPerPiece(
  per100g: {
    kcal: Prisma.Decimal;
    proteinGrams: Prisma.Decimal;
    carbsGrams: Prisma.Decimal;
    fatGrams: Prisma.Decimal;
    fiberGrams: Prisma.Decimal | null;
    saltGrams: Prisma.Decimal | null;
  },
  pieceGrams: Prisma.Decimal,
): typeof per100g {
  if (pieceGrams.lte(0)) {
    throw new Error('pieceGrams musi być większe od zera.');
  }
  const factor = pieceGrams.div(100);
  return {
    kcal: per100g.kcal.mul(factor),
    proteinGrams: per100g.proteinGrams.mul(factor),
    carbsGrams: per100g.carbsGrams.mul(factor),
    fatGrams: per100g.fatGrams.mul(factor),
    fiberGrams: per100g.fiberGrams ? per100g.fiberGrams.mul(factor) : null,
    saltGrams: per100g.saltGrams ? per100g.saltGrams.mul(factor) : null,
  };
}
