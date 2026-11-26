import { ACTIVE_SEASON } from './seasonalProduction';

export const REGISTRY_PREFERENCES_KEY = 'silago_registry_preferences_v1';

export const MAP_LAYER_OPTIONS = {
  satellite: 'Satellite',
  osm: 'Street',
  topo: 'Terrain',
  dark: 'Dark'
} as const;

export interface RegistryPreferences {
  mapLayer: keyof typeof MAP_LAYER_OPTIONS;
  mapLatitude: number;
  mapLongitude: number;
  mapZoom: number;
  areaPrecision: number;
  parcelPrefix: string;
  activeSeason: string;
  agriculturistName: string;
  agriculturistTitle: string;
  showAnnouncement: boolean;
  showBarangayDirectory: boolean;
  showLegalRepository: boolean;
  dateFormat: 'MDY' | 'DMY' | 'ISO';
  uppercaseNames: boolean;
}

export const DEFAULT_REGISTRY_PREFERENCES: RegistryPreferences = {
  mapLayer: 'satellite',
  mapLatitude: 10.538,
  mapLongitude: 125.172,
  mapZoom: 13,
  areaPrecision: 2,
  parcelPrefix: 'FARMER-SLG',
  activeSeason: ACTIVE_SEASON,
  agriculturistName: '',
  agriculturistTitle: 'Municipal Agriculturist',
  showAnnouncement: true,
  showBarangayDirectory: true,
  showLegalRepository: true,
  dateFormat: 'MDY',
  uppercaseNames: true
};

export function normalizeRegistryPreferences(value: Partial<RegistryPreferences> = {}): RegistryPreferences {
  const preferences = { ...DEFAULT_REGISTRY_PREFERENCES, ...value };
  const numberIn = (number: number, min: number, max: number, fallback: number) =>
    typeof number === 'number' && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  return {
    ...preferences,
    mapLayer: Object.hasOwn(MAP_LAYER_OPTIONS, preferences.mapLayer) ? preferences.mapLayer : 'satellite',
    mapLatitude: numberIn(preferences.mapLatitude, -85, 85, DEFAULT_REGISTRY_PREFERENCES.mapLatitude),
    mapLongitude: numberIn(preferences.mapLongitude, -180, 180, DEFAULT_REGISTRY_PREFERENCES.mapLongitude),
    mapZoom: Math.round(numberIn(preferences.mapZoom, 3, 19, 13)),
    areaPrecision: Math.round(numberIn(preferences.areaPrecision, 0, 4, 2)),
    parcelPrefix: (typeof preferences.parcelPrefix === 'string' && preferences.parcelPrefix.toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 24)) || 'FARMER-SLG',
    activeSeason: preferences.activeSeason || ACTIVE_SEASON,
    dateFormat: ['MDY', 'DMY', 'ISO'].includes(preferences.dateFormat) ? preferences.dateFormat : 'MDY'
  };
}

export function readRegistryPreferences(): RegistryPreferences {
  try {
    return normalizeRegistryPreferences(JSON.parse(localStorage.getItem(REGISTRY_PREFERENCES_KEY) || '{}') || {});
  } catch {
    return DEFAULT_REGISTRY_PREFERENCES;
  }
}

export function formatRegistryDate(value: string | undefined, format: RegistryPreferences['dateFormat']): string {
  if (!value) return 'N/A';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const parts = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : null;
  if (!parts) return value;
  const [year, month, day] = parts;
  return format === 'ISO' ? `${year}-${month}-${day}`
    : format === 'DMY' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

export function formatRegistryName(name: string, uppercase: boolean): string {
  if (uppercase) return name.toUpperCase();
  return name.toLowerCase().replace(/\p{L}+/gu, (word) =>
    /^(?:ii|iii|iv|vi|vii|viii|ix)$/i.test(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1));
}

export function readReportIdentity() {
  let stored: Record<string, string> = {};
  try { stored = JSON.parse(localStorage.getItem('silago_municipal_branding') || '{}') || {}; } catch {}
  return {
    republic: stored.republicText || 'Republic of the Philippines',
    province: stored.provinceText || 'Province of Southern Leyte',
    municipality: stored.municipalityName || 'MUNICIPALITY OF SILAGO',
    office: stored.officeName || 'MUNICIPAL AGRICULTURE OFFICE'
  };
}
