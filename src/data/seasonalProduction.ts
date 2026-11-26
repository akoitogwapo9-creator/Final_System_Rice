import { FarmParcel, SeasonalProductionRecord } from '../types';
import { RICE_VARIETIES } from './riceVarieties';

export function getSeasonIdentity(value = '') {
  const period = value.match(/(?:^|\W)(wet|dry|ws|ds)(?=\W|\d|$)|(?:19|20)\d{2}(ws|ds)\b/i);
  const years = value.match(/(?:19|20)\d{2}/g);
  const year = Number(years?.at(-1));
  if (!period || !year) return null;
  const kind = /^(wet|ws)$/i.test(period[1] || period[2]) ? 'Wet' : 'Dry';
  return { kind, year };
}

function seasonLabel(kind: string, year: number) {
  return kind === 'Wet'
    ? `Wet Season (WS) ${year} (June – Nov ${year})`
    : `Dry Season (DS) ${year} (Dec ${year - 1} – May ${year})`;
}

const today = new Date();
const month = today.getMonth();
const currentYear = today.getFullYear() + (month === 11 ? 1 : 0);
export const ACTIVE_SEASON = seasonLabel(month >= 5 && month <= 10 ? 'Wet' : 'Dry', currentYear);
export const CROPPING_SEASONS = Array.from(
  { length: Math.max(currentYear - 2025 + 2, 3) },
  (_, index) => currentYear + 1 - index
).flatMap((year) => [seasonLabel('Wet', year), seasonLabel('Dry', year)]);

export function getSeasonOptions(values: (string | undefined)[] = []): string[] {
  const options = new Set([...CROPPING_SEASONS, ...values.filter((value): value is string => Boolean(value))].map((value) => {
    const season = getSeasonIdentity(value);
    return season ? seasonLabel(season.kind, season.year) : value;
  }));
  return [...options].sort((a, b) => seasonOrder(b) - seasonOrder(a));
}

export function seasonOrder(value: string) {
  const season = getSeasonIdentity(value);
  return season ? season.year * 2 + Number(season.kind === 'Wet') : 0;
}

export function getParcelSeasonOptions(parcels: FarmParcel[], extra: string[] = []) {
  return getSeasonOptions([...extra, ...parcels.flatMap((parcel) => [
    parcel.croppingSeason || parcel.season,
    ...(parcel.seasonalRecords || []).map((record) => record.season)
  ])]);
}

const LEGACY_ESTIMATES = [
  ['2026WS', '2026-07-20T08:00:00Z', 'Adequate communal irrigation water supply; basal fertilizer applied.'],
  ['2026DS', '2026-05-05T10:30:00Z', 'Dry season bumper crop with high solar radiation and low blast incidence.'],
  ['2025WS', '2025-11-15T09:00:00Z', 'Slight monsoon lodging noted in field perimeter, overall good grain fill.'],
  ['2025DS', '2025-05-15T08:30:00Z', 'High dry matter accumulation; clean grain threshing.']
] as const;

export function isLegacyProductionEstimate(parcel: FarmParcel, record: SeasonalProductionRecord) {
  if (record.harvestedAreaHa != null) return false;
  const index = LEGACY_ESTIMATES.findIndex(([key, timestamp, remarks]) =>
    record.id === `PROD-${parcel.tagNumber}-${key}` &&
    record.recordedAt === timestamp && record.remarks === remarks);
  if (index < 0) return false;
  const variety = RICE_VARIETIES.find((item) => item.name.toLowerCase() === record.seedVariety.toLowerCase());
  const multiplier = [0.95 + (parcel.lat % 0.1) * 2, 1.08, 0.92, 1.05][index];
  const expected = Number(((parcel.weightKg || 1.2) * ((variety?.aveYieldMt || 4.8) * multiplier)).toFixed(2));
  return record.actualProductionVolumeMt === expected;
}

export function getSeasonRecord(parcel: FarmParcel, season: string) {
  return parcel.seasonalRecords?.find((record) => matchesSeasonFilter(record.season, season));
}

export function hasActualProduction(record: Pick<SeasonalProductionRecord, 'productionStatus' | 'actualProductionVolumeMt'>) {
  return record.productionStatus === 'Harvest Completed' || record.productionStatus === 'Crop Failure / Damaged' || record.actualProductionVolumeMt > 0;
}

/**
 * Calculates estimated harvest date based on planting date and variety maturity days
 */
export function computeEstimatedHarvestDate(plantingDate: string, varietyName: string): string {
  if (!plantingDate) return '';
  const matched = RICE_VARIETIES.find((v) => v.name.toLowerCase() === varietyName.toLowerCase());
  const maturityDays = matched ? matched.maturityDays : 115;
  const plantTime = new Date(plantingDate).getTime();
  if (isNaN(plantTime)) return '';
  const harvestTime = plantTime + maturityDays * 24 * 60 * 60 * 1000;
  return new Date(harvestTime).toISOString().split('T')[0];
}

/**
 * Computes Yield in Metric Tons per Hectare
 */
export function computeYieldMtPerHa(actualVolumeMt: number, areaHa: number): number {
  if (!areaHa || areaHa <= 0) return 0;
  return Number((actualVolumeMt / areaHa).toFixed(2));
}

export function getShortSeasonName(season: string): string {
  if (season === 'ALL_SEASONS' || season === 'ALL') return 'All Seasons';
  const identity = getSeasonIdentity(season);
  return identity ? `${identity.kind} Season ${identity.year}` : season;
}

/**
 * Normalizes any seasonal record to ensure both primary and alias properties are populated
 */
export function normalizeSeasonalRecord(
  rec: Partial<SeasonalProductionRecord> & { parcelTag?: string },
  defaultTag = 'PARCEL-001'
): SeasonalProductionRecord {
  const parcelTag = rec.parcelTag || defaultTag;
  const originalSeason = rec.season || rec.seasonName || ACTIVE_SEASON;
  const identity = getSeasonIdentity(originalSeason);
  const season = identity ? seasonLabel(identity.kind, identity.year) : originalSeason;
  const seedVariety = rec.seedVariety || rec.varietyPlanted || 'Not recorded';
  const volumeMt = Number(rec.actualProductionVolumeMt ?? ((rec.actualProductionBags ?? rec.yieldBags ?? 0) / 20));
  const bags = Number(rec.actualProductionBags ?? rec.yieldBags ?? Math.round(volumeMt * 20));
  const yieldMt = Number(rec.yieldMtPerHa ?? rec.yieldMetricTons ?? 0);
  const harvestDate = rec.actualHarvestDate || rec.harvestDate || rec.estimatedHarvestDate || '';
  const prodStatus = rec.productionStatus || (rec.status === 'Ongoing' ? 'Standing Crop' : rec.status === 'Damaged' ? 'Crop Failure / Damaged' : rec.status === 'Not recorded' ? 'Not recorded' : 'Harvest Completed');
  const status = (prodStatus === 'Standing Crop' ? 'Ongoing' : prodStatus === 'Crop Failure / Damaged' ? 'Damaged' : prodStatus === 'Not recorded' ? 'Not recorded' : 'Harvested');

  return {
    id: rec.id || `PROD-${parcelTag}-${identity ? `${identity.year}${identity.kind === 'Wet' ? 'WS' : 'DS'}` : encodeURIComponent(season)}`,
    parcelTag,
    season,
    seasonName: getShortSeasonName(season),
    seedVariety,
    varietyPlanted: seedVariety,
    seedType: RICE_VARIETIES.find((variety) => variety.name.toLowerCase() === seedVariety.toLowerCase())?.seedType || rec.seedType || 'UNKNOWN',
    plantingDate: rec.plantingDate || '',
    estimatedHarvestDate: rec.estimatedHarvestDate || '',
    actualHarvestDate: rec.actualHarvestDate || (status === 'Harvested' ? harvestDate : undefined),
    harvestDate,
    harvestedAreaHa: rec.harvestedAreaHa,
    actualProductionVolumeMt: volumeMt,
    actualProductionBags: bags,
    yieldBags: bags,
    yieldMtPerHa: yieldMt,
    yieldMetricTons: yieldMt,
    grossIncome: Number(rec.grossIncome ?? (bags * 1150)),
    productionStatus: prodStatus,
    status,
    growthStage: rec.growthStage,
    elapsedDas: rec.elapsedDas,
    maturityPercentage: rec.maturityPercentage,
    lftOfficerName: rec.lftOfficerName,
    recordedAt: rec.recordedAt || new Date().toISOString(),
    remarks: rec.remarks
  };
}

/**
 * Checks if a seasonal record matches the user-selected season filter
 */
export function matchesSeasonFilter(recSeason: string | undefined, filterSeason: string): boolean {
  if (!filterSeason || filterSeason === 'ALL_SEASONS' || filterSeason === 'ALL') return true;
  if (!recSeason) return false;
  if (recSeason === filterSeason) return true;
  const record = getSeasonIdentity(recSeason);
  const filter = getSeasonIdentity(filterSeason);
  return Boolean(record && filter && record.kind === filter.kind && record.year === filter.year);
}
