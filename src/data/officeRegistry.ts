import type { FarmParcel } from '../types';

export const VERIFICATION_STATUSES = [
  'Pending Verification', 'Verified by MAO', 'Flagged / Needs Revision'
] as const;

export const rsbsaReference = (value?: string) =>
  (value || '').trim().toUpperCase().replace(/^RSBSA[ -]+/, '').replace(/\s*-\s*/g, '-');

export const isRsbsaReference = (value: string) => /^\d{2}-\d{2}-\d{2}-\d{3}-\d{6}$/.test(value);

export function farmerKey(parcel: FarmParcel) {
  const reference = rsbsaReference(parcel.swineNameOrId || parcel.rsbsa_no);
  return parcel.farmerGroupId || (reference && reference !== 'NO RSBSA' ? reference : parcel.tagNumber);
}

export function groupFarmerParcels(parcels: FarmParcel[]) {
  return [...new Map(parcels.map((parcel) => [farmerKey(parcel), parcel])).values()];
}

export function farmLabel(parcel: FarmParcel) {
  return parcel.farmLabel || 'Farm 1';
}

export function boundaryKey(boundary?: [number, number][]) {
  const points = (boundary || []).map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`);
  return [...new Set(points)].sort().join('|');
}
