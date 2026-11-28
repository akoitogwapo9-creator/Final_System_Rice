import type { FarmParcel } from '../types';

export const VERIFICATION_STATUSES = [
  'Pending Verification', 'Verified by MAO', 'Flagged / Needs Revision'
] as const;

export const rsbsaReference = (value?: string) =>
  (value || '').trim().toUpperCase().replace(/^RSBSA[ -]+/, '').replace(/\s*-\s*/g, '-');

export const isRsbsaReference = (value: string) => /^\d{2}-\d{2}-\d{2}-\d{3}-\d{6}$/.test(value);

export function farmerReference(parcel: FarmParcel) {
  return [parcel.swineNameOrId, parcel.rsbsa_no].map(rsbsaReference)
    .find(reference => reference && reference !== 'NO RSBSA') || '';
}

export function farmerKey(parcel: FarmParcel) {
  return farmerReference(parcel) || parcel.farmerGroupId || parcel.tagNumber;
}

export function parcelDescription(parcel: FarmParcel) {
  const area = Number(parcel.areaHa ?? parcel.weightKg ?? 0).toFixed(2);
  return `${farmLabel(parcel)} — Brgy. ${parcel.barangay} · ${area} ha · ${parcel.ecosystem || parcel.purpose || 'Ecosystem not recorded'}`;
}

export function groupFarmerParcels(parcels: FarmParcel[]) {
  return [...new Map(parcels.map((parcel) => [farmerKey(parcel), parcel])).values()];
}

export function farmLabel(parcel: FarmParcel) {
  return parcel.farmLabel || 'Farm 1';
}

export function nextAvailableFarmLabels(parcels: FarmParcel[], count: number) {
  const existing = new Set(parcels.map(parcel => farmLabel(parcel)));
  const labels: string[] = [];
  for (let number = 1; labels.length < count; number++) {
    const label = `Farm ${number}`;
    if (!existing.has(label)) labels.push(label);
  }
  return labels;
}

export function boundaryKey(boundary?: [number, number][]) {
  const points = (boundary || []).map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`);
  return [...new Set(points)].sort().join('|');
}
