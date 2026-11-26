import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, FarmParcel, Language, BackgroundPreset, LftAccount, SeasonalProductionRecord, OfficeContactInfo, PortalTab, MunicipalBrandingSettings, LandingPageConfig, MandateCardItem, GovernmentSubsidyProgram, SubsidyCategory, SubsidyClaimRecord, SubsidyHistoryEntry, isAccountActive } from '../types';
import { BARANGAYS, BarangayProfiles, getAssignedLftForBarangay, isUserAuthorizedForBarangay, OFFICIAL_15_BARANGAYS } from '../data/barangays';
import { DEFAULT_BG_PHOTO, DEFAULT_SLSU_PHOTO, SLSU_DEFAULTS, PRESET_BACKGROUNDS } from '../data/photos';
import { DEFAULT_SUBSIDY_PROGRAMS } from '../data/subsidies';
import { RiceVariety, RICE_VARIETIES, mergeRequiredRiceVarieties } from '../data/riceVarieties';
import { normalizeSeasonalRecord, getSeasonIdentity, getSeasonOptions, matchesSeasonFilter, seasonOrder, CROPPING_SEASONS, ACTIVE_SEASON } from '../data/seasonalProduction';
import { supabase } from '../supabase';
import {
  mapFarmerRowToParcel,
  normalizeFarmParcel,
  normalizeLftAccount,
  sortParcelsAlphabetically,
  supabaseDb,
  broadcastRealtimeChange,
  getOfflinePendingFarms,
  syncOfflinePendingFarms,
  checkDuplicateRsbsa,
  checkDuplicateFarmerName,
  withTimeout
} from '../utils/supabaseClient';
import {
  getUserPermissions,
  canUserAddParcel,
  canUserEditParcel,
  canUserDeleteParcel,
  canUserManageLftAccounts,
  UserPermissions
} from '../utils/rbac';
import { hashPasswordSync, isHashedPassword } from '../utils/security';
import { LegalDecree, DEFAULT_LEGAL_DECREES, normalizeDecreeList } from '../data/legalDecrees';
import {
  FORM_SCHEMA_STORAGE_KEY,
  PARCEL_CUSTOM_FIELDS_KEY,
  FORM_SCHEMA_EVENT,
  PersistedFormSchema
} from '../data/formSchema';
import { setReportCustomLogoCache } from '../utils/reportExportUtils';
import { getTranslation } from '../locales/translations';
import {
  clearSessionUserKeys,
  readSessionActiveTab,
  writeSessionActiveTab
} from '../utils/sessionAuth';

export const DEFAULT_OFFICE_CONTACT_INFO: OfficeContactInfo = {
  schedule: 'Monday – Friday: 8:00 AM – 5:00 PM',
  hotline: '(053) 572-8812',
  mobile: '0917-822-4911',
  email: 'agri.silago@southernleyte.gov.ph'
};

export const DEFAULT_MUNICIPAL_BRANDING: MunicipalBrandingSettings = {
  municipalityName: 'Municipality of Silago',
  registryTitle: 'Rice Farm Registry',
  officeName: 'Municipal Agriculture Office',
  republicText: 'Republic of the Philippines',
  provinceText: 'Province of Southern Leyte',
  mayorName: 'Hon. Lemuel P. Honor',
  silagoSealUrl: null,
  bagOngSilagoLogoUrl: null,
  daLogoUrl: null
};

export const DEFAULT_LANDING_PAGE_CONFIG: LandingPageConfig = {
  // Hero Badges & Headlines
  heroBadge: 'OFFICIAL MUNICIPAL RICE FARM REGISTRY · SILAGO',
  heroPwaBadge: '100% Offline PWA Field Access Ready',
  heroHeadline: 'A clearer view of every rice farm in Silago.',
  heroDescription: 'The Municipal Agriculture Office registry brings farmer records, georeferenced parcels, and field services together in one place.',
  heroReturnBtnText: 'Return to Executive Dashboard',
  heroReturnLftBtnText: 'Return to LFT Field Portal',
  heroSignInBtnText: 'Sign In as Central Admin',

  // Hero Section Background Customization
  heroBgColor: '#123b2b',
  heroBgImageUrl: '',
  heroBgOpacity: 45,
  heroBgBlur: 0,
  heroBgOverlayOpacity: 50,

  // Hero Right Logo Card & Logo Backing Customization
  heroCardBgColor: '',
  heroCardBgImageUrl: '',
  heroCardBgOpacity: 75,
  heroCardBgBlur: 0,
  heroCardBgOverlayOpacity: 35,
  heroLogoBackingColor: '#ffffff',
  heroCardTextTheme: 'light',

  // Announcement Banner
  topNoticeTag: 'Official Notice',
  topNoticeText: '2026 Wet Season RSBSA Georeferencing & Palay Monitoring active across all 15 Silago Barangays.',
  topNoticeLinkText: 'Explore 15 Barangays →',

  // Live Stats Labels & Season
  statLabelParcels: 'TOTAL REGISTERED PARCELS',
  statLabelFarmers: 'REGISTERED FARMERS',
  statLabelBarangays: 'BARANGAYS WITH RECORDS',
  seasonYear: '2026',
  seasonLabel: 'WET SEASON REGISTRY',

  // Role Access Cards
  adminPortalTag: 'Executive Portal',
  adminPortalTitle: 'Central Admin Portal',
  adminPortalDesc: 'Full executive suite: municipal farm parcel masterlist, user management, legal decrees, and Excel/Word exports.',
  adminPortalBtn: 'Sign In as Central Admin',

  lftPortalTag: 'Field Operations',
  lftPortalTitle: 'LFT Field Officer Portal',
  lftPortalDesc: 'Decentralized barangay sector access: RSBSA tiller enrollment, GPS land boundary mapping, and seasonal records.',
  lftPortalBtn: 'Enter LFT Field Portal',

  publicPortalTag: 'Public Access',
  publicPortalTitle: 'Public Web GIS Portal',
  publicPortalDesc: 'Open public GIS land map, 15 barangays directory, verified palay varieties catalog, and production reports.',
  publicPortalBtn: 'Explore Public GIS Map',

  // Coverage Section
  coverageTag: 'FULL MUNICIPALITY COVERAGE',
  coverageTitle: 'All 15 Barangays of Silago',
  coverageDesc: 'Each barangay operates its own scoped Local Farm Technician (LFT) account for decentralized registration.',
  filterAllLabel: 'All (15)',
  filterCoastalLabel: 'Coastal Sectors',
  filterInlandLabel: 'Inland & Irrigated',

  // LGU Field Operations Banner
  lftBannerTag: 'LGU SILAGO FIELD OPERATIONS',
  lftBannerTitle: 'Are you an assigned Local Farm Technician (LFT)?',
  lftBannerDesc: "Log in to record today's parcel registrations, check irrigation buffers, and print your barangay rice reports.",
  lftBannerBtn: 'Sign In to Staff Portal →',

  // Dynamic Mandate / Partnership / Information Cards (Editable + Addable)
  mandateCards: [
    {
      id: 'mandate-1',
      tag: 'MUNICIPAL MANDATE',
      title: 'Rice Production & Sustainable Farm Security',
      description: "Silago's rice industry is governed under modern agricultural initiatives, providing farm mechanization, certified inbred/hybrid palay seed distribution, and continuous field crop health audits."
    },
    {
      id: 'mandate-2',
      tag: 'ACADEMIC PARTNERSHIPS',
      title: 'LSU - Agricultural Extension',
      description: 'Developed in coordination with Southern Leyte State University Agricultural Extension, this GIS geospatial registry empowers LFT technicians and barangay coordinators with real-time field mapping.'
    },
    {
      id: 'mandate-3',
      tag: 'SURVEILLANCE ZONING',
      title: 'DA RFO-VIII Priority Rice Zone',
      description: 'Silago maintains continuous agricultural monitoring, NIA communal irrigation management, and field assistance checkpoints ensuring food security and high palay yields for all residents.'
    }
  ],

  // Footer & Office Details
  footerOfficeName: 'Silago DA Office',
  footerOfficeSubtitle: 'MUNICIPAL AGRICULTURE',
  footerOfficeAddress: 'Office of the Municipal Agriculturist, Silago Municipal Hall Complex, Southern Leyte, Philippines 6607.',
  footerNavTitle: 'QUICK NAVIGATION',
  footerNavAbout: 'About the Office',
  footerNavDirectory: '15 Barangays Directory',
  footerHoursTitle: 'OFFICE HOURS & HOTLINE',
  footerPortalAccessTitle: 'PORTAL ACCESS',
  footerPortalAccessDesc: 'Restricted to authorized Municipal Agriculture Office staff and designated Local Farm Technicians (LFT).',
  footerPortalAccessBtn: 'Return to Portal',
  footerCopyright: '© 2026 Municipality of Silago · Office of the Municipal Agriculturist'
};

const DEFAULT_ECOSYSTEMS = [
  'Irrigated Lowland (NIA)',
  'Rainfed Lowland',
  'Hybrid Seed Production',
  'Upland Terraces'
];

const DEFAULT_TENURES = [
  'Owner-Cultivator',
  'Tenant Farmer',
  'Agrarian Reform Beneficiary (ARB)',
  'Leaseholder'
];

const DEFAULT_SEASONS = [ACTIVE_SEASON, ...CROPPING_SEASONS.filter((season) => season !== ACTIVE_SEASON)];

const DEFAULT_IRRIGATION_ASSOCIATIONS = [
  'Balagawan Communal Irrigators Association (BCIA)',
  'Silago River Irrigation System IA (SRIS-IA)',
  'Hinabian Farmers Irrigators Association',
  'Katipunan-Mercedes Irrigators Association',
  'Lagoma-Tubod Irrigators Association',
  'Puntana-Salvacion Farmers IA',
  'San Isidro-San Roque Irrigators Group',
  'Individual / Non-IA Member (Rainfed / Shallow Tube)'
];

export const INITIAL_LFT_ACCOUNTS: LftAccount[] = [];

export interface SystemLogos {
  daLogoUrl: string | null;
  silagoLogoUrl: string | null;
  bagOngSilagoLogoUrl: string | null;
  southernLeyteLogoUrl: string | null;
  bagongPilipinasLogoUrl: string | null;
  portalBannerUrl: string | null;
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null | ((prev: User | null) => User | null)) => void;
  updateCurrentUserProfile: (profile: Partial<User>) => void;
  updateCurrentUserPassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  parcels: FarmParcel[];
  addParcel: (parcel: FarmParcel) => Promise<void>;
  updateParcel: (tagNumber: string, updated: Partial<FarmParcel>) => Promise<void>;
  deleteParcel: (tagNumber: string) => void;
  deleteBulkParcels: (tagNumbers: string[]) => Promise<void>;
  resetParcels: () => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (keyPath: string, fallback?: string) => string;

  // LFT Officer Accounts Management
  lftAccounts: LftAccount[];
  addLftAccount: (account: Omit<LftAccount, 'id'>) => void;
  updateLftAccount: (id: string, updated: Partial<LftAccount>) => void;
  deleteLftAccount: (id: string) => void;
  resetLftAccounts: () => void;
  reorderLftAccounts: (accountsOrStartIndex: LftAccount[] | number, endIndex?: number) => void;

  bgPhotoUrl: string;
  bgOpacity: number;
  bgBlur: number;
  bgActive: boolean;
  setBgPhotoUrl: (url: string, name?: string, source?: 'upload' | 'preset') => void;
  setBgOpacity: (opacity: number) => void;
  setBgBlur: (blur: number) => void;
  setBgActive: (active: boolean) => void;
  removeBgPhoto: () => void;
  backgroundHistory: BackgroundPreset[];
  addToBackgroundHistory: (url: string, name?: string, source?: 'upload' | 'preset') => void;
  removeFromBackgroundHistory: (id: string) => void;
  clearBackgroundHistory: () => void;

  daLogoUrl: string | null;
  setDaLogoUrl: (url: string | null) => void;
  silagoLogoUrl: string | null;
  setSilagoLogoUrl: (url: string | null) => void;
  bagOngSilagoLogoUrl: string | null;
  setBagOngSilagoLogoUrl: (url: string | null) => void;
  southernLeyteLogoUrl: string | null;
  setSouthernLeyteLogoUrl: (url: string | null) => void;
  bagongPilipinasLogoUrl: string | null;
  setBagongPilipinasLogoUrl: (url: string | null) => void;
  portalBannerUrl: string | null;
  setPortalBannerUrl: (url: string | null) => void;
  systemLogos: SystemLogos;
  updateSystemLogo: (key: keyof SystemLogos, url: string | null) => void;
  setSystemLogos: (logos: Partial<SystemLogos>) => void;
  resetLogos: () => void;

  // Central Admin Profile & Password Settings
  adminProfile: {
    name: string;
    title: string;
    email: string;
    contactNumber: string;
    office: string;
    photoUrl?: string;
  };
  updateAdminProfile: (data: Partial<{
    name: string;
    title: string;
    email: string;
    contactNumber: string;
    office: string;
    photoUrl?: string;
  }>) => void;

  slsuPhotoUrl: string;
  setSlsuPhotoUrl: (url: string) => void;
  slsuLayoutMode: 'banner' | 'full' | 'seal';
  setSlsuLayoutMode: (mode: 'banner' | 'full' | 'seal') => void;
  slsuCaption: string;
  setSlsuCaption: (caption: string) => void;
  slsuSealLogoUrl: string | null;
  setSlsuSealLogoUrl: (url: string | null) => void;
  slsuUniversityName: string;
  setSlsuUniversityName: (name: string) => void;
  slsuMotto: string;
  setSlsuMotto: (motto: string) => void;
  slsuYear: string;
  setSlsuYear: (year: string) => void;
  slsuCenterTitle: string;
  setSlsuCenterTitle: (title: string) => void;
  slsuCenterSubtitle: string;
  setSlsuCenterSubtitle: (sub: string) => void;
  slsuBadgeTag: string;
  setSlsuBadgeTag: (tag: string) => void;
  slsuTopTags: string;
  setSlsuTopTags: (tags: string) => void;
  settingsActiveSubTab: 'profile' | 'municipal' | 'featured_card' | 'display' | 'media' | 'landing';
  setSettingsActiveSubTab: (subTab: 'profile' | 'municipal' | 'featured_card' | 'display' | 'media' | 'landing') => void;
  resetSlsuDetails: () => void;
  resetAllDefaults: () => void;

  // Municipal Branding & System Identification Settings
  municipalBranding: MunicipalBrandingSettings;
  updateMunicipalBranding: (branding: Partial<MunicipalBrandingSettings>) => void;
  resetMunicipalBranding: () => void;

  // Office Hours & Hotline Settings (Central Admin Managed)
  officeContactInfo: OfficeContactInfo;
  updateOfficeContactInfo: (info: Partial<OfficeContactInfo>) => void;
  resetOfficeContactInfo: () => void;

  // Landing Page Dynamic Configuration & Customizer
  landingPageConfig: LandingPageConfig;
  updateLandingPageConfig: (config: Partial<LandingPageConfig>) => void;
  resetLandingPageConfig: () => void;
  addMandateCard: (card: Omit<MandateCardItem, 'id'>) => void;
  updateMandateCard: (id: string, updated: Partial<MandateCardItem>) => void;
  deleteMandateCard: (id: string) => void;

  // Legal Decrees & Ordinances Registry (Synced to Public Interface)
  legalDecrees: LegalDecree[];
  addLegalDecree: (decree: Omit<LegalDecree, 'id'>) => void;
  updateLegalDecree: (id: string, updated: Partial<LegalDecree>) => void;
  deleteLegalDecree: (id: string) => void;
  resetLegalDecrees: () => void;

  // Government Agricultural Subsidies (Seedlings / Fertilizer) & Owner Claim Tracking
  subsidyPrograms: GovernmentSubsidyProgram[];
  subsidyClaims: SubsidyClaimRecord[];
  subsidyHistory: SubsidyHistoryEntry[];
  addSubsidyProgram: (program: Omit<GovernmentSubsidyProgram, 'id' | 'createdAt'>) => GovernmentSubsidyProgram;
  updateSubsidyProgram: (id: string, updated: Partial<GovernmentSubsidyProgram>) => void;
  deleteSubsidyProgram: (id: string) => void;
  setOwnerSubsidyClaim: (
    programId: string,
    parcel: FarmParcel,
    data: {
      claimed: boolean;
      inputType?: SubsidyCategory;
      itemGiven?: string;
      claimedAt?: string;
      quantityReceived?: string;
      slipOrVoucherNo?: string;
      recipientName?: string;
      releasedBy?: string;
      remarks?: string;
    }
  ) => void;
  bulkMarkSubsidyClaims: (
    programId: string,
    targetParcels: FarmParcel[],
    claimed: boolean,
    defaultQuantity?: string,
    claimedAtOverride?: string,
    inputTypeOverride?: SubsidyCategory,
    itemGivenOverride?: string
  ) => void;
  addSubsidyHistoryEntry: (
    entry: Omit<SubsidyHistoryEntry, 'id' | 'recordedAt'>,
    parcel?: FarmParcel
  ) => SubsidyHistoryEntry | null;
  deleteSubsidyHistoryEntry: (entryId: string) => void;

  // Manage Varieties (Add, Edit, Delete)
  varieties: RiceVariety[];
  addVariety: (variety: RiceVariety) => void;
  updateVariety: (oldName: string, updated: Partial<RiceVariety>) => void;
  deleteVariety: (name: string) => void;

  // Manage Ecosystems (Add, Edit, Delete)
  ecosystems: string[];
  addEcosystem: (name: string) => void;
  updateEcosystem: (oldName: string, newName: string) => void;
  deleteEcosystem: (name: string) => void;

  // Manage Tenures (Add, Edit, Delete)
  tenures: string[];
  addTenure: (name: string) => void;
  updateTenure: (oldName: string, newName: string) => void;
  deleteTenure: (name: string) => void;

  // Manage Cropping Seasons (Add, Edit, Delete)
  seasons: string[];
  addSeason: (name: string) => void;
  updateSeason: (oldName: string, newName: string) => void;
  deleteSeason: (name: string) => void;

  // Manage Irrigation Associations (Add, Edit, Delete)
  irrigationAssociations: string[];
  addIrrigationAssociation: (name: string) => void;
  updateIrrigationAssociation: (oldName: string, newName: string) => void;
  deleteIrrigationAssociation: (name: string) => void;

  // Master-Detail Seasonal Production Management
  activeSeason: string;
  setActiveSeason: (season: string) => void;
  addSeasonalRecord: (
    parcelTag: string,
    record: Omit<SeasonalProductionRecord, 'id' | 'parcelTag' | 'recordedAt'>
  ) => void;
  updateSeasonalRecord: (
    parcelTag: string,
    recordId: string,
    updated: Partial<SeasonalProductionRecord>
  ) => void;
  deleteSeasonalRecord: (parcelTag: string, recordId: string) => void;

  // Supabase Realtime & RBAC State
  permissions: UserPermissions;
  realtimeStatus: 'connected' | 'connecting' | 'reconnecting';
  isRealtimeSyncing: boolean;
  syncWithSupabase: () => Promise<void>;
  offlineQueueCount: number;
  isOnline: boolean;
  syncOfflineQueue: () => Promise<void>;
  syncNotification: string | null;
  setSyncNotification: (msg: string | null) => void;

  // Active Navigation Tab State
  activeTab: PortalTab;
  setActiveTab: (tab: PortalTab) => void;

  // Farm Parcels Supabase Fetch & Mapping Methods
  fetchParcels: () => Promise<void>;
  mapFarmerToParcel: (row: any) => FarmParcel;

  barangayProfiles: BarangayProfiles;
  updateBarangayProfile: (name: string, profile: BarangayProfiles[string]) => Promise<boolean>;

  // User Session & Auth Loading State
  isLoading: boolean;
  isAuthLoading: boolean;
}

function normalizeParcelNames(parcel: FarmParcel): FarmParcel {
  const { farmerFamilyName, farmerGivenName, farmerMiddleName, farmerSuffix, raiserName } = normalizeFarmParcel(parcel);
  return { ...parcel, farmerFamilyName, farmerGivenName, farmerMiddleName, farmerSuffix, raiserName };
}

const BARANGAY_PROFILES_KEY = 'silago_barangay_profiles';

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode; syncPortalNavigation?: boolean }> = ({
  children,
  syncPortalNavigation = true
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [barangayProfiles, setBarangayProfiles] = useState<BarangayProfiles>(() => {
    try {
      return JSON.parse(localStorage.getItem(BARANGAY_PROFILES_KEY) || '{}') || {};
    } catch {
      return {};
    }
  });

  const applyBarangayProfiles = useCallback((profiles: BarangayProfiles) => {
    setBarangayProfiles(profiles);
    try {
      localStorage.setItem(BARANGAY_PROFILES_KEY, JSON.stringify(profiles));
    } catch {}
  }, []);

  useEffect(() => {
    let active = true;
    void supabaseDb.getSetting<BarangayProfiles>(BARANGAY_PROFILES_KEY).then((profiles) => {
      if (active && profiles) applyBarangayProfiles(profiles);
    });
    return () => { active = false; };
  }, [applyBarangayProfiles]);

  const updateBarangayProfile = async (name: string, profile: BarangayProfiles[string]) => {
    if (currentUser?.role !== 'Central Admin' || !OFFICIAL_15_BARANGAYS.some((item) => item === name)) return false;
    const displayName = profile.displayName.trim();
    if (!displayName || (profile.classification !== 'Coastal' && profile.classification !== 'Upland')) return false;
    const next = { ...barangayProfiles, [name]: { ...profile, displayName } };
    applyBarangayProfiles(next);
    return supabaseDb.setSetting(BARANGAY_PROFILES_KEY, next);
  };

  // Active Navigation Tab State (persisted per session in sessionStorage & URL state)
  const [activeTab, setActiveTabState] = useState<PortalTab>(() => {
    const publicSafeTabs: PortalTab[] = ['eartags', 'reports', 'evaluation', 'legal_decrees', 'map'];
    const sanitizeInitialTab = (candidate: PortalTab | null): PortalTab | null => {
      if (!candidate) return null;
      return publicSafeTabs.includes(candidate) ? candidate : 'eartags';
    };
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlTab = sanitizeInitialTab(urlParams.get('tab') as PortalTab | null);
        if (urlTab) return urlTab;
        const savedTab = sanitizeInitialTab(readSessionActiveTab() as PortalTab | null);
        if (savedTab) return savedTab;
      }
    } catch {}
    return 'eartags';
  });

  const setActiveTab = useCallback((tab: PortalTab) => {
    setActiveTabState(tab);
    if (!syncPortalNavigation) return;
    try {
      if (typeof window !== 'undefined') {
        writeSessionActiveTab(tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', url.toString());
      }
    } catch {}
  }, [syncPortalNavigation]);

  // Track initial auth check loading status
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // Check supabase.auth.getSession() on app initial load before declaring user unauthenticated
  useEffect(() => {
    let isMounted = true;
    clearSessionUserKeys();

    const resolveAuthorizedSessionUser = async (accessToken: string): Promise<User | null> => {
      const { data: { user }, error } = await supabase.auth.getUser(accessToken);
      if (error || !user || user.is_anonymous) return null;
      const userEmail = (user.email || '').trim().toLowerCase();
      const userPhone = (user.phone || '').replace(/\D/g, '');
      const identifier = userEmail || userPhone || user.id;
      const hydrated = await supabaseDb.hydrateUserRole(identifier);

      if (hydrated?.role === 'Barangay Focal Person') {
        if (hydrated.status && !isAccountActive(hydrated.status)) {
          await supabase.auth.signOut().catch(() => {});
          return null;
        }
        return {
          username: hydrated.username || userEmail.split('@')[0],
          role: 'Barangay Focal Person',
          name: hydrated.name || user.user_metadata?.full_name || 'LFT Field Officer',
          title: hydrated.title || 'Local Farmer Technician (LFT)',
          email: userEmail || hydrated.email,
          contactNumber: hydrated.contactNumber || user.phone,
          barangay: hydrated.barangay,
          assignedBarangays: hydrated.assignedBarangays,
          status: hydrated.status,
          photoUrl: user.user_metadata?.avatar_url || hydrated.photoUrl
        };
      }

      const cloudProfile = await supabaseDb.getSetting<{ email?: string; name?: string; title?: string; contactNumber?: string; office?: string; photoUrl?: string }>('silago_admin_profile');
      const registeredAdminEmail = (cloudProfile?.email || 'admin@gmail.com').trim().toLowerCase();
      const registeredAdminDigits = (cloudProfile?.contactNumber || '').replace(/\D/g, '');
      const matchesAdminEmail = Boolean(userEmail && registeredAdminEmail && userEmail === registeredAdminEmail);
      const matchesAdminPhone = Boolean(
        userPhone.length >= 7 && registeredAdminDigits.length >= 7 && userPhone.slice(-9) === registeredAdminDigits.slice(-9)
      );

      if (matchesAdminEmail || matchesAdminPhone) {
        return {
          username: 'admin',
          role: 'Central Admin',
          name: cloudProfile?.name || user.user_metadata?.full_name || 'Municipal Administrator',
          title: cloudProfile?.title || 'Municipal Agriculture Administrator',
          email: userEmail || cloudProfile?.email,
          contactNumber: cloudProfile?.contactNumber || user.phone,
          office: cloudProfile?.office || 'Silago Municipal Agriculture Office (DA-MAO)',
          photoUrl: user.user_metadata?.avatar_url || cloudProfile?.photoUrl
        };
      }

      // Unrecognized email/phone: do not escalate to Central Admin
      await supabase.auth.signOut().catch(() => {});
      return null;
    };

    let authChange = 0;
    const checkInitialSession = async () => {
      const change = authChange;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          const resolvedUser = await resolveAuthorizedSessionUser(session.access_token);
          if (isMounted && change === authChange && resolvedUser) {
            setCurrentUser(resolvedUser);
            setActiveTab(resolvedUser.role === 'Central Admin' ? 'dashboard' : 'lft_dashboard');
          }
        }
      } catch (err) {
        console.warn('Initial session check note:', err);
      } finally {
        if (isMounted) {
          setIsAuthLoading(false);
        }
      }
    };

    checkInitialSession();

    // Resolve roles after the Supabase auth callback releases its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_OUT') {
        authChange++;
        setCurrentUser(null);
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
        const change = ++authChange;
        window.setTimeout(async () => {
          if (!isMounted || change !== authChange) return;
          try {
            const resolvedUser = await resolveAuthorizedSessionUser(session.access_token);
            if (isMounted && change === authChange) {
              setCurrentUser(resolvedUser);
            }
          } catch (err) {
            console.warn('Session verification notice:', err);
          }
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [setActiveTab]);

  // Role-Based Permissions for Active User Session
  const permissions = useMemo(() => getUserPermissions(currentUser), [currentUser]);

  // Supabase Realtime Connection Status
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'reconnecting'>('connected');
  const [isRealtimeSyncing, setIsRealtimeSyncing] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser) {
      // Live State Hydration on any device: verify and hydrate role directly from Supabase DB
      if (currentUser.role !== 'Central Admin' && (currentUser.email || currentUser.username || currentUser.contactNumber)) {
        const identifier = currentUser.email || currentUser.username || currentUser.contactNumber || '';
        supabaseDb.hydrateUserRole(identifier).then((hydrated) => {
          if (hydrated) {
            if (hydrated.status && !isAccountActive(hydrated.status)) {
              setCurrentUser(null);
              return;
            }
            setCurrentUser((prev) => (prev ? { ...prev, ...hydrated } : null));
          }
        });
      }
    }
  }, [currentUser?.email, currentUser?.username, setCurrentUser]);

  // Farm Parcels Database State (Pure Async Remote Supabase Source of Truth + Cached Persistence + Alphabetical A-Z)
  const [parcels, setParcels] = useState<FarmParcel[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached =
          localStorage.getItem('rice_registry_parcels') ||
          localStorage.getItem('silago_cached_parcels');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return sortParcelsAlphabetically(parsed.map(normalizeParcelNames));
          }
        }
      }
    } catch {}
    return [];
  });
  const [isParcelsLoading, setIsParcelsLoading] = useState<boolean>(true);

  // LFT Accounts State (Pure Async Remote Supabase Source of Truth)
  const [lftAccounts, setLftAccounts] = useState<LftAccount[]>([]);

  // Offline state & pending synchronization queue tracker
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(() => getOfflinePendingFarms().length);
  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  // Mapper function: converts raw 'farmers' table row into standard FarmParcel object
  const mapFarmerToParcel = useCallback((row: any): FarmParcel => {
    return mapFarmerRowToParcel(row);
  }, []);

  // Fetch Parcels: reads directly from 'farmers' table using supabase.from("farmers").select("*")
  const fetchParcels = useCallback(async () => {
    setIsParcelsLoading(true);
    try {
      const { data, error } = await supabase.from('farmers').select('*');

      if (!error && Array.isArray(data)) {
        const mapped: FarmParcel[] = (data as any[]).map(mapFarmerToParcel);
        const pending = getOfflinePendingFarms();
        const combined: FarmParcel[] = [...mapped];
        pending.forEach((p) => {
          const idx = combined.findIndex((c) => c.tagNumber === p.tagNumber);
          if (idx >= 0) combined[idx] = p;
          else combined.unshift(p);
        });

        const sorted = sortParcelsAlphabetically(combined);
        setParcels(sorted);
        try {
          const serialized = JSON.stringify(sorted);
          localStorage.setItem('silago_rice_parcels', serialized);
          localStorage.setItem('rice_registry_parcels', serialized);
          localStorage.setItem('silago_cached_parcels', serialized);
        } catch {}
      } else {
        // Fallback to cached parcels if Supabase is offline or returned error
        try {
          const cached =
            localStorage.getItem('silago_rice_parcels') ||
            localStorage.getItem('rice_registry_parcels') ||
            localStorage.getItem('silago_cached_parcels');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setParcels(sortParcelsAlphabetically(parsed.map(normalizeParcelNames)));
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('fetchParcels notice / offline fallback:', err);
      try {
        const cached =
          localStorage.getItem('silago_rice_parcels') ||
          localStorage.getItem('rice_registry_parcels') ||
          localStorage.getItem('silago_cached_parcels');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setParcels(sortParcelsAlphabetically(parsed.map(normalizeParcelNames)));
          }
        }
      } catch {}
    } finally {
      setIsParcelsLoading(false);
    }
  }, [mapFarmerToParcel]);

  // Initial cloud fetch on mount
  useEffect(() => {
    fetchParcels();
  }, [fetchParcels]);

  // Manual & Automated Trigger to re-sync with Supabase tables directly
  const syncWithSupabase = useCallback(async () => {
    setIsRealtimeSyncing(true);
    try {
      const [, cloudLfts] = await Promise.all([
        fetchParcels(),
        supabaseDb.getLftAccounts(),
      ]);
      if (Array.isArray(cloudLfts)) {
        setLftAccounts((prev) => {
          if (cloudLfts.length === 0) return prev;
          const prevPasswordByUsername = new Map(
            prev.filter((a) => a.password).map((a) => [a.username.trim().toLowerCase(), a.password!])
          );
          return cloudLfts.map((acc) => {
            if (acc.password) return acc;
            const cachedPwd = prevPasswordByUsername.get(acc.username.trim().toLowerCase());
            return cachedPwd ? { ...acc, password: cachedPwd } : acc;
          });
        });
      }
    } catch (err) {
      console.warn('Manual sync note:', err);
    } finally {
      setIsRealtimeSyncing(false);
      setIsParcelsLoading(false);
    }
  }, [fetchParcels]);

  // Manual & Automated Trigger to sync offline pending queue to Supabase
  const syncOfflineQueue = useCallback(async () => {
    if (!currentUser) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncNotification('Offline: Internet connection is not available yet.');
      setTimeout(() => setSyncNotification(null), 4000);
      return;
    }
    const currentQueue = getOfflinePendingFarms();
    if (currentQueue.length === 0) {
      setOfflineQueueCount(0);
      return;
    }

    try {
      const { syncedCount, conflictCount, conflicts } = await syncOfflinePendingFarms();
      const remaining = getOfflinePendingFarms();
      setOfflineQueueCount(remaining.length);

      if (syncedCount > 0) {
        setSyncNotification(`Sync complete: ${syncedCount} offline record${syncedCount > 1 ? 's' : ''} uploaded to database.`);
        setTimeout(() => setSyncNotification(null), 5000);
        // Refresh local table with Supabase records
        syncWithSupabase();
      }

      if (conflictCount > 0) {
        setSyncNotification(`Sync notice: ${conflictCount} record${conflictCount > 1 ? 's' : ''} had RSBSA conflict. Please review.`);
        setTimeout(() => setSyncNotification(null), 6000);
      }
    } catch (err) {
      console.warn('Sync offline queue notice:', err);
    }
  }, [syncWithSupabase, currentUser]);

  // Online / Offline connectivity listener & auto-sync trigger
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (currentUser) {
        setSyncNotification('Network connection detected. Synchronizing offline queue...');
        void syncOfflineQueue();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (currentUser) setSyncNotification('Offline mode: Records will be saved locally and queued for automatic cloud synchronization.');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      // If online and there are pending offline records on mount, trigger sync
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const pending = getOfflinePendingFarms();
        if (pending.length > 0) {
          syncOfflineQueue();
        }
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [syncOfflineQueue, currentUser]);

  // Handle App Settings updates from Realtime
  const handleSettingUpsert = useCallback((key: string, value: any) => {
    if (key === BARANGAY_PROFILES_KEY && value && typeof value === 'object') applyBarangayProfiles(value);
    else if (key === 'silago_language') setLanguageState(value === 'CEB' ? 'CEB' : 'EN');
    else if (key === 'silago_bg_photo_url') setBgPhotoUrlState(value);
    else if (key === 'silago_bg_opacity') setBgOpacityState(Number(value));
    else if (key === 'silago_bg_blur') setBgBlurState(Number(value));
    else if (key === 'silago_bg_active') setBgActiveState(value === true || value === 'true');
    else if (key === 'silago_bg_history' && Array.isArray(value)) setBackgroundHistory(value);
    else if (key === 'silago_da_logo_url') { setDaLogoUrlState(value); try { if (value) localStorage.setItem('silago_da_logo_url', value); else localStorage.removeItem('silago_da_logo_url'); } catch {} }
    else if (key === 'silago_seal_url') { setSilagoLogoUrlState(value); try { if (value) localStorage.setItem('silago_seal_url', value); else localStorage.removeItem('silago_seal_url'); } catch {} }
    else if (key === 'silago_bag_ong_logo_url') { setBagOngSilagoLogoUrlState(value); try { if (value) localStorage.setItem('silago_bag_ong_logo_url', value); else localStorage.removeItem('silago_bag_ong_logo_url'); } catch {} }
    else if (key === 'silago_southern_leyte_logo_url') { setSouthernLeyteLogoUrlState(value); try { if (value) localStorage.setItem('silago_southern_leyte_logo_url', value); else localStorage.removeItem('silago_southern_leyte_logo_url'); } catch {} }
    else if (key === 'silago_bagong_pilipinas_logo_url') { setBagongPilipinasLogoUrlState(value); try { if (value) localStorage.setItem('silago_bagong_pilipinas_logo_url', value); else localStorage.removeItem('silago_bagong_pilipinas_logo_url'); } catch {} }
    else if (key === 'silago_portal_banner_url') { setPortalBannerUrlState(value); try { if (value) localStorage.setItem('silago_portal_banner_url', value); else localStorage.removeItem('silago_portal_banner_url'); } catch {} }
    else if (key === 'silago_admin_profile' && value) setAdminProfile(value);
    else if (key.startsWith('silago_lft_password_') && value) {
      const uname = key.slice('silago_lft_password_'.length).trim().toLowerCase();
      if (uname) {
        setLftAccounts((prev) =>
          prev.map((acc) =>
            acc.username.trim().toLowerCase() === uname ? { ...acc, password: String(value) } : acc
          )
        );
      }
    }
    else if (key === 'silago_office_contact_info' && value) setOfficeContactInfoState(value);
    else if (key === 'silago_rice_varieties' && Array.isArray(value)) setVarieties(value);
    else if (key === 'silago_ecosystems' && Array.isArray(value)) setEcosystems(value);
    else if (key === 'silago_tenures' && Array.isArray(value)) setTenures(value);
    else if (key === 'silago_seasons' && Array.isArray(value)) setSeasons(value);
    else if (key === 'silago_irrigation_associations' && Array.isArray(value)) setIrrigationAssociations(value);
    else if (key === 'silago_slsu_photo_url') setSlsuPhotoUrlState(value);
    else if (key === 'silago_slsu_layout_mode') setSlsuLayoutModeState(value);
    else if (key === 'silago_slsu_caption') setSlsuCaptionState(value);
    else if (key === 'silago_slsu_seal_logo_url') setSlsuSealLogoUrlState(value);
    else if (key === 'silago_slsu_center_title') setSlsuCenterTitleState(value);
    else if (key === 'silago_slsu_center_subtitle') setSlsuCenterSubtitleState(value);
    else if (key === 'silago_slsu_badge_tag') setSlsuBadgeTagState(value);
    else if (key === 'silago_slsu_top_tags') setSlsuTopTagsState(value);
    else if (key === 'silago_municipal_branding' && value) {
      setMunicipalBrandingState((prev) => ({ ...prev, ...value }));
      try { localStorage.setItem('silago_municipal_branding', JSON.stringify(value)); } catch {}
      if (value.silagoSealUrl !== undefined) setSilagoLogoUrlState(value.silagoSealUrl);
      if (value.bagOngSilagoLogoUrl !== undefined) setBagOngSilagoLogoUrlState(value.bagOngSilagoLogoUrl);
      if (value.daLogoUrl !== undefined) setDaLogoUrlState(value.daLogoUrl);
    }
    else if (key === 'silago_landing_page_config' && value) {
      setLandingPageConfigState((prev) => {
        const merged: LandingPageConfig = {
          ...DEFAULT_LANDING_PAGE_CONFIG,
          ...prev,
          ...value,
          mandateCards: Array.isArray(value.mandateCards) && value.mandateCards.length > 0
            ? value.mandateCards
            : prev.mandateCards
        };
        try { localStorage.setItem('silago_landing_page_config', JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
    else if (key === 'silago_legal_decrees' && Array.isArray(value)) {
      const normalized = normalizeDecreeList(value);
      setLegalDecreesState(normalized);
      try { localStorage.setItem('silago_legal_decrees', JSON.stringify(normalized)); } catch {}
    }
    else if (key === 'silago_subsidy_programs' && Array.isArray(value)) {
      setSubsidyProgramsState(value);
      try { localStorage.setItem('silago_subsidy_programs', JSON.stringify(value)); } catch {}
    }
    else if (key === 'silago_subsidy_claims' && Array.isArray(value)) {
      setSubsidyClaimsState(value);
      try { localStorage.setItem('silago_subsidy_claims', JSON.stringify(value)); } catch {}
    }
    else if (key === 'silago_subsidy_history' && Array.isArray(value)) {
      setSubsidyHistoryState(value);
      try { localStorage.setItem('silago_subsidy_history', JSON.stringify(value)); } catch {}
    }
    else if (key === FORM_SCHEMA_STORAGE_KEY && value && typeof value === 'object') {
      try {
        localStorage.setItem(FORM_SCHEMA_STORAGE_KEY, JSON.stringify(value));
        window.dispatchEvent(new CustomEvent(FORM_SCHEMA_EVENT, { detail: value }));
      } catch {}
    }
    else if (key === PARCEL_CUSTOM_FIELDS_KEY && value && typeof value === 'object') {
      try {
        localStorage.setItem(PARCEL_CUSTOM_FIELDS_KEY, JSON.stringify(value));
      } catch {}
    }
  }, [applyBarangayProfiles]);

  const handleSettingDelete = useCallback((key: string) => {
    if (key === 'silago_da_logo_url') { setDaLogoUrlState(null); try { localStorage.removeItem('silago_da_logo_url'); } catch {} }
    else if (key === 'silago_seal_url') { setSilagoLogoUrlState(null); try { localStorage.removeItem('silago_seal_url'); } catch {} }
    else if (key === 'silago_bag_ong_logo_url') { setBagOngSilagoLogoUrlState(null); try { localStorage.removeItem('silago_bag_ong_logo_url'); } catch {} }
    else if (key === 'silago_southern_leyte_logo_url') { setSouthernLeyteLogoUrlState(null); try { localStorage.removeItem('silago_southern_leyte_logo_url'); } catch {} }
    else if (key === 'silago_bagong_pilipinas_logo_url') { setBagongPilipinasLogoUrlState(null); try { localStorage.removeItem('silago_bagong_pilipinas_logo_url'); } catch {} }
    else if (key === 'silago_portal_banner_url') { setPortalBannerUrlState(null); try { localStorage.removeItem('silago_portal_banner_url'); } catch {} }
    else if (key === 'silago_slsu_seal_logo_url') setSlsuSealLogoUrlState(null);
    else if (key === 'silago_municipal_branding') {
      setMunicipalBrandingState(DEFAULT_MUNICIPAL_BRANDING);
      try { localStorage.removeItem('silago_municipal_branding'); } catch {}
    }
    else if (key === 'silago_landing_page_config') {
      setLandingPageConfigState(DEFAULT_LANDING_PAGE_CONFIG);
      try { localStorage.removeItem('silago_landing_page_config'); } catch {}
    }
  }, []);

  // Supabase Realtime Channels Subscription: listening for INSERT, UPDATE, DELETE on 'farms', 'farmers', and 'lft_technicians'
  useEffect(() => {
    let isMounted = true;

    // 1. Initial Cloud Hydration from Supabase
    syncWithSupabase();

    // 2. Real-time subscription in App context using supabase.channel('db-changes')
    const channel = supabase
      .channel('db-changes')
      // --- 'farmers' table: Realtime CDC synchronization (INSERT, UPDATE, DELETE) ---
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'farmers' },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'INSERT') {
            if (!payload.new) return;
            const incoming = mapFarmerToParcel(payload.new);
            setParcels((prev) => {
              const index = prev.findIndex(
                (p) =>
                  p.tagNumber === incoming.tagNumber ||
                  (incoming.swineNameOrId &&
                    incoming.swineNameOrId !== 'NO RSBSA' &&
                    p.swineNameOrId &&
                    p.swineNameOrId.trim().toLowerCase() === incoming.swineNameOrId.trim().toLowerCase())
              );
              let updated: FarmParcel[];
              if (index >= 0) {
                updated = [...prev];
                updated[index] = { ...updated[index], ...incoming };
              } else {
                updated = [incoming, ...prev];
              }
              const sorted = sortParcelsAlphabetically(updated);
              try {
                localStorage.setItem('rice_registry_parcels', JSON.stringify(sorted));
                localStorage.setItem('silago_cached_parcels', JSON.stringify(sorted));
              } catch {}
              return sorted;
            });
          } else if (payload.eventType === 'UPDATE') {
            if (!payload.new) return;
            const incoming = mapFarmerToParcel(payload.new);
            setParcels((prev) => {
              const index = prev.findIndex(
                (p) =>
                  p.tagNumber === incoming.tagNumber ||
                  (incoming.swineNameOrId &&
                    incoming.swineNameOrId !== 'NO RSBSA' &&
                    p.swineNameOrId &&
                    p.swineNameOrId.trim().toLowerCase() === incoming.swineNameOrId.trim().toLowerCase())
              );
              let updated: FarmParcel[];
              if (index >= 0) {
                updated = [...prev];
                updated[index] = { ...updated[index], ...incoming };
              } else {
                updated = [incoming, ...prev];
              }
              const sorted = sortParcelsAlphabetically(updated);
              try {
                localStorage.setItem('rice_registry_parcels', JSON.stringify(sorted));
                localStorage.setItem('silago_cached_parcels', JSON.stringify(sorted));
              } catch {}
              return sorted;
            });
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as any;
            const oldTag = old?.id || old?.tagNumber || old?.tag_number || old?.parcel_tag;
            const oldRsbsa = old?.rsbsa_number || old?.rsbsa_no;
            const oldName = old?.farmer_name || old?.farmerName;

            setParcels((prev) => {
              const filtered = prev.filter((p) => {
                if (oldTag && (p.tagNumber === oldTag || (p as any).id === oldTag || p.tagNumber === `FARMER-${oldTag}`)) {
                  return false;
                }
                if (oldRsbsa && p.swineNameOrId && p.swineNameOrId.trim().toLowerCase() === String(oldRsbsa).trim().toLowerCase()) {
                  return false;
                }
                if (oldName && p.raiserName && p.raiserName.trim().toLowerCase() === String(oldName).trim().toLowerCase()) {
                  return false;
                }
                return true;
              });
              try {
                localStorage.setItem('rice_registry_parcels', JSON.stringify(filtered));
                localStorage.setItem('silago_cached_parcels', JSON.stringify(filtered));
              } catch {}
              return filtered;
            });
          }
        }
      )
      // --- 'lft_technicians' table: INSERT, UPDATE, and DELETE events ---
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lft_technicians' },
        (payload) => {
          if (!isMounted || !payload.new) return;
          const incoming = normalizeLftAccount(payload.new);
          setLftAccounts((prev) => {
            const index = prev.findIndex((a) => a.id === incoming.id || a.username === incoming.username);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], ...incoming };
              return updated;
            }
            return [incoming, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lft_technicians' },
        (payload) => {
          if (!isMounted || !payload.new) return;
          const incoming = normalizeLftAccount(payload.new);
          setLftAccounts((prev) => {
            const index = prev.findIndex((a) => a.id === incoming.id || a.username === incoming.username);
            if (index >= 0) {
              const updated = [...prev];
              updated[index] = { ...updated[index], ...incoming };
              return updated;
            }
            return [incoming, ...prev];
          });
          setCurrentUser((prev) => {
            if (prev && (prev.username === incoming.username || prev.email === incoming.email)) {
              return {
                ...prev,
                name: incoming.name,
                contactNumber: incoming.contactNumber,
                barangay: incoming.barangay,
                assignedBarangays: incoming.assignedBarangays,
                photoUrl: incoming.photoUrl || prev.photoUrl
              };
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'lft_technicians' },
        (payload) => {
          if (!isMounted) return;
          const oldId = (payload.old as any)?.id || (payload.old as any)?.username;
          if (oldId) {
            setLftAccounts((prev) => prev.filter((a) => a.id !== oldId && a.username !== oldId));
          }
        }
      )
      // --- App Settings & System Settings ---
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'DELETE' && payload.old) {
            const oldKey = (payload.old as any)?.key;
            if (oldKey) handleSettingDelete(oldKey);
          } else if (payload.new) {
            const key = (payload.new as any)?.key;
            const val = (payload.new as any)?.value;
            if (key !== undefined) handleSettingUpsert(key, val);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (!isMounted) return;
          if (payload.eventType === 'DELETE' && payload.old) {
            const oldKey = (payload.old as any)?.key;
            if (oldKey) handleSettingDelete(oldKey);
          } else if (payload.new) {
            const key = (payload.new as any)?.key;
            const val = (payload.new as any)?.value;
            if (key !== undefined) handleSettingUpsert(key, val);
          }
        }
      )
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setRealtimeStatus('reconnecting');
        } else {
          setRealtimeStatus('connecting');
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [syncWithSupabase, handleSettingUpsert, handleSettingDelete]);

  // Active Cropping Season (LFT Twice-a-Year Rice Production)
  const [activeSeason, setActiveSeason] = useState<string>(ACTIVE_SEASON);

  const addParcel = async (parcel: FarmParcel) => {
    if (!canUserAddParcel(currentUser, parcel.barangay)) {
      throw new Error('Unauthorized: You do not have permission to register rice farm parcels in this barangay.');
    }
    // 1. Enforce numeric-only contact number (strip non-digits, accept 11-digit mobile 09XXXXXXXXX)
    let sanitizedContact = (parcel.contactNumber || '').trim();
    if (sanitizedContact) {
      const digits = sanitizedContact.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('09')) {
        sanitizedContact = digits;
      } else if (digits.length > 0) {
        throw new Error('Validation Error: Contact number must be an 11-digit mobile number starting with 09 (e.g. 09XXXXXXXXX).');
      }
    }

    // 2. Validate existing RSBSA number duplicate prevention
    const cleanRsbsa = (parcel.swineNameOrId || parcel.rsbsa_no || '').trim();
    if (cleanRsbsa && cleanRsbsa.toUpperCase() !== 'NO RSBSA') {
      const existingRsbsa = parcels.find(
        (p) =>
          p.tagNumber !== parcel.tagNumber &&
          (p.swineNameOrId || p.rsbsa_no || '').trim().toLowerCase() === cleanRsbsa.toLowerCase()
      );
      if (existingRsbsa) {
        throw new Error(`Duplicate RSBSA: A farmer with RSBSA No. "${cleanRsbsa}" is already registered (${existingRsbsa.raiserName || 'Existing Record'}).`);
      }
    }

    // 3. Validate existing Full Name duplicate prevention
    const normalizeName = (s: string) => s.toLowerCase().trim().replace(/[,.-]/g, ' ').replace(/\s+/g, ' ');
    const parcelName = normalizeName(
      [parcel.farmerGivenName, parcel.farmerMiddleName, parcel.farmerFamilyName].filter(Boolean).join(' ') ||
      parcel.raiserName ||
      ''
    );

    if (parcelName.length >= 3) {
      const existingName = parcels.find((p) => {
        if (p.tagNumber === parcel.tagNumber) return false;
        const pName = normalizeName(
          [p.farmerGivenName, p.farmerMiddleName, p.farmerFamilyName].filter(Boolean).join(' ') ||
          p.raiserName ||
          ''
        );
        const pBrgy = (p.barangay || '').trim().toLowerCase();
        const targetBrgy = (parcel.barangay || '').trim().toLowerCase();
        return pName === parcelName && (!pBrgy || !targetBrgy || pBrgy === targetBrgy);
      });

      if (existingName) {
        throw new Error(`Duplicate Farmer Name: A farmer named "${parcel.raiserName || parcelName}" is already registered in Barangay ${parcel.barangay || 'the system'}.`);
      }
    }

    // 4. Format ID as 'FARMER-SLG-...'
    const rawTag = (parcel.tagNumber || '').trim();
    let formattedTag = rawTag;
    if (!formattedTag) {
      formattedTag = `FARMER-SLG-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    } else if (!formattedTag.startsWith('FARMER-SLG-')) {
      if (formattedTag.startsWith('FARMER-')) {
        formattedTag = `FARMER-SLG-${formattedTag.replace(/^FARMER-/, '')}`;
      } else if (formattedTag.startsWith('SLG-')) {
        formattedTag = `FARMER-${formattedTag}`;
      } else {
        formattedTag = `FARMER-SLG-${formattedTag}`;
      }
    }

    const validatedParcel = normalizeParcelNames({ ...parcel, tagNumber: formattedTag, contactNumber: sanitizedContact });

    // Optimistically update local parcels state and cached storage immediately
    setParcels((prev) => {
      const updated = sortParcelsAlphabetically([validatedParcel, ...prev.filter((p) => p.tagNumber !== validatedParcel.tagNumber)]);
      try {
        localStorage.setItem('rice_registry_parcels', JSON.stringify(updated));
        localStorage.setItem('silago_cached_parcels', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    try {
      // Direct Remote Supabase CRUD & Realtime Broadcast - throws on duplicate constraint / 23505
      await supabaseDb.upsertParcel(validatedParcel);
    } catch (err: any) {
      const isUniqueViolation =
        err?.code === '23505' ||
        err?.message?.includes('23505') ||
        err?.message?.toLowerCase().includes('unique') ||
        err?.message?.toLowerCase().includes('duplicate key');

      if (isUniqueViolation) {
        // Rollback state and cache if unique constraint error occurred
        setParcels((prev) => {
          const reverted = prev.filter((p) => p.tagNumber !== validatedParcel.tagNumber);
          try {
            localStorage.setItem('rice_registry_parcels', JSON.stringify(reverted));
            localStorage.setItem('silago_cached_parcels', JSON.stringify(reverted));
          } catch {}
          return reverted;
        });
        throw err;
      }
      console.warn('Supabase remote sync notice:', err?.message || err);
    } finally {
      setOfflineQueueCount(getOfflinePendingFarms().length);
    }
  };

  const updateParcel = async (tagNumber: string, updatedFields: Partial<FarmParcel>) => {
    const existing = parcels.find((p) => p.tagNumber === tagNumber);
    if (existing) {
      if (!canUserEditParcel(currentUser, existing)) {
        throw new Error('Unauthorized: You do not have permission to modify this farm parcel record.');
      }
      const targetUpdated = normalizeParcelNames({ ...existing, ...updatedFields });
      setParcels((prev) => {
        const updated = prev.map((p) => (p.tagNumber === tagNumber ? targetUpdated : p));
        try {
          localStorage.setItem('rice_registry_parcels', JSON.stringify(updated));
          localStorage.setItem('silago_cached_parcels', JSON.stringify(updated));
        } catch {}
        return updated;
      });
      try {
        await supabaseDb.upsertParcel(targetUpdated);
      } catch (err: any) {
        console.warn('Supabase parcel update notice:', err?.message || err);
      } finally {
        setOfflineQueueCount(getOfflinePendingFarms().length);
      }
    }
  };

  const deleteParcel = (tagNumber: string) => {
    if (!canUserDeleteParcel(currentUser)) return;
    setParcels((prev) => {
      const filtered = prev.filter((p) => p.tagNumber !== tagNumber);
      try {
        localStorage.setItem('rice_registry_parcels', JSON.stringify(filtered));
        localStorage.setItem('silago_cached_parcels', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });
    supabaseDb.deleteParcel(tagNumber).then(() => {
      setOfflineQueueCount(getOfflinePendingFarms().length);
    }).catch((err) => {
      console.warn('Supabase parcel deletion notice:', err?.message || err);
    });
  };

  const deleteBulkParcels = async (tagNumbers: string[]) => {
    if (!canUserDeleteParcel(currentUser)) return;
    if (!tagNumbers || tagNumbers.length === 0) return;
    setParcels((prev) => {
      const filtered = prev.filter((p) => !tagNumbers.includes(p.tagNumber));
      try {
        localStorage.setItem('rice_registry_parcels', JSON.stringify(filtered));
        localStorage.setItem('silago_cached_parcels', JSON.stringify(filtered));
      } catch {}
      return filtered;
    });
    try {
      await supabaseDb.deleteBulkFarmRecords(tagNumbers);
    } catch (err: any) {
      console.warn('Supabase bulk deletion notice:', err?.message || err);
    } finally {
      setOfflineQueueCount(getOfflinePendingFarms().length);
    }
  };

  const resetParcels = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setParcels([]);
    try {
      localStorage.removeItem('rice_registry_parcels');
      localStorage.removeItem('silago_cached_parcels');
    } catch {}
  };

  // Master-detail seasonal production record methods
  const saveSeasonalRecord = (
    parcelTag: string,
    fields: Partial<SeasonalProductionRecord>,
    recordId?: string
  ) => {
    const parcel = parcels.find((item) => item.tagNumber === parcelTag);
    if (!parcel || !canUserEditParcel(currentUser, parcel)) return;
    const records = parcel.seasonalRecords || [];
    const existing = records.find((item) =>
      recordId ? item.id === recordId : matchesSeasonFilter(item.season, fields.season || '')
    );
    const record = normalizeSeasonalRecord({ ...existing, ...fields, parcelTag }, parcelTag);
    const seasonalRecords = [record, ...records.filter((item) => item.id !== existing?.id)]
      .sort((a, b) => seasonOrder(b.season) - seasonOrder(a.season));
    const parcelSeason = parcel.croppingSeason || parcel.season || '';
    const isLatest = seasonalRecords[0] === record &&
      (!parcel.plantingDate || seasonOrder(record.season) >= seasonOrder(parcelSeason));
    const stage = record.productionStatus === 'Harvest Completed' ? 'Harvested'
      : record.productionStatus === 'Crop Failure / Damaged' ? 'Damaged'
      : record.growthStage || 'Active Crop';
    void updateParcel(parcelTag, {
      seasonalRecords,
      ...isLatest && {
        breed: record.seedVariety,
        variety: record.seedVariety,
        seedType: record.seedType,
        plantingDate: record.plantingDate,
        harvestDate: record.harvestDate,
        croppingSeason: record.season,
        season: record.season,
        healthStatus: stage,
        standingCropStage: stage
      }
    });
  };

  const addSeasonalRecord = (
    parcelTag: string,
    record: Omit<SeasonalProductionRecord, 'id' | 'parcelTag' | 'recordedAt'>
  ) => saveSeasonalRecord(parcelTag, record);

  const updateSeasonalRecord = (
    parcelTag: string,
    recordId: string,
    updatedFields: Partial<SeasonalProductionRecord>
  ) => saveSeasonalRecord(parcelTag, updatedFields, recordId);

  const deleteSeasonalRecord = (parcelTag: string, recordId: string) => {
    const parcel = parcels.find((item) => item.tagNumber === parcelTag);
    if (!parcel || !canUserEditParcel(currentUser, parcel)) return;
    void updateParcel(parcelTag, {
      seasonalRecords: (parcel.seasonalRecords || []).filter((record) => record.id !== recordId)
    });
  };

  const addLftAccount = (accountData: Omit<LftAccount, 'id'>) => {
    if (!canUserManageLftAccounts(currentUser)) return;
    const hashedPassword = accountData.password ? hashPasswordSync(accountData.password) : undefined;
    const newAccount: LftAccount = {
      ...accountData,
      ...(hashedPassword ? { password: hashedPassword } : {}),
      id: `lft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    };
    setLftAccounts((prev) => [newAccount, ...prev.filter((a) => a.id !== newAccount.id)]);
    supabaseDb.upsertLftAccount(newAccount);
    if (hashedPassword && newAccount.username) {
      supabaseDb.setSetting(`silago_lft_password_${newAccount.username.trim().toLowerCase()}`, hashedPassword);
    }
  };

  const updateLftAccount = (id: string, updatedFields: Partial<LftAccount>) => {
    const isSelfUpdate = currentUser && currentUser.role !== 'Central Admin' && lftAccounts.some((a) => a.id === id && a.username === currentUser.username);
    if (!canUserManageLftAccounts(currentUser) && !isSelfUpdate) return;
    const safeFields: Partial<LftAccount> = { ...updatedFields };
    if (safeFields.password && !isHashedPassword(safeFields.password)) {
      safeFields.password = hashPasswordSync(safeFields.password);
    }
    const existing = lftAccounts.find((acc) => acc.id === id);
    const targetUpdated: LftAccount | null = existing ? { ...existing, ...safeFields } : null;
    setLftAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, ...safeFields } : acc))
    );
    if (targetUpdated) {
      supabaseDb.upsertLftAccount(targetUpdated);
      if (safeFields.password && targetUpdated.username) {
        supabaseDb.setSetting(`silago_lft_password_${targetUpdated.username.trim().toLowerCase()}`, safeFields.password);
      }
    }
  };

  const deleteLftAccount = (id: string) => {
    if (!canUserManageLftAccounts(currentUser)) return;
    const target = lftAccounts.find((acc) => acc.id === id);
    setLftAccounts((prev) => prev.filter((acc) => acc.id !== id));
    supabaseDb.deleteLftAccount(id);
    if (target?.username) {
      supabaseDb.removeSetting(`silago_lft_password_${target.username.trim().toLowerCase()}`);
    }
  };

  const resetLftAccounts = () => {
    if (!canUserManageLftAccounts(currentUser)) return;
    setLftAccounts([]);
  };

  const reorderLftAccounts = (accountsOrStartIndex: LftAccount[] | number, endIndex?: number) => {
    if (!canUserManageLftAccounts(currentUser)) return;
    if (typeof accountsOrStartIndex === 'number' && typeof endIndex === 'number') {
      setLftAccounts((prev) => {
        const result: LftAccount[] = [...prev];
        if (
          accountsOrStartIndex >= 0 &&
          accountsOrStartIndex < result.length &&
          endIndex >= 0 &&
          endIndex < result.length
        ) {
          const [removed] = result.splice(accountsOrStartIndex, 1);
          result.splice(endIndex, 0, removed);
        }
        return result;
      });
    } else if (Array.isArray(accountsOrStartIndex)) {
      setLftAccounts(accountsOrStartIndex);
    }
  };

  // Language State (Persisted in localStorage & Supabase)
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('silago_language') as Language | null;
        if (stored === 'EN' || stored === 'CEB') return stored;
      }
    } catch {}
    return 'EN';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('silago_language', lang);
      }
    } catch {}
    if (currentUser?.role === 'Central Admin') void supabaseDb.setSetting('silago_language', lang);
  }, [currentUser?.role]);

  const t = useCallback((keyPath: string, fallback?: string): string => {
    return getTranslation(language, keyPath, fallback);
  }, [language]);

  // Background & Media Settings
  const [bgPhotoUrl, setBgPhotoUrlState] = useState<string>(DEFAULT_BG_PHOTO);
  const [bgOpacity, setBgOpacityState] = useState<number>(0.09);
  const [bgBlur, setBgBlurState] = useState<number>(1);
  const [bgActive, setBgActiveState] = useState<boolean>(false);
  const [backgroundHistory, setBackgroundHistory] = useState<BackgroundPreset[]>(PRESET_BACKGROUNDS);

  const updateHistory = (history: BackgroundPreset[]) => {
    setBackgroundHistory(history);
    supabaseDb.setSetting('silago_bg_history', history);
  };

  const addToBackgroundHistory = (url: string, name?: string, source: 'upload' | 'preset' = 'upload') => {
    if (currentUser?.role !== 'Central Admin') return;
    const existingIdx = backgroundHistory.findIndex((h) => h.url === url);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    let updated: BackgroundPreset[] = [
      {
        id: `bg-hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        url,
        name: name || (source === 'upload' ? `Uploaded Photo (${dateStr})` : 'Custom Background Photo'),
        timestamp: dateStr,
        source
      },
      ...backgroundHistory.filter((_, idx) => idx !== existingIdx)
    ];
    if (updated.length > 25) updated = updated.slice(0, 25);
    updateHistory(updated);
  };

  const removeFromBackgroundHistory = (id: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    const updated = backgroundHistory.filter((h) => h.id !== id);
    updateHistory(updated);
  };

  const clearBackgroundHistory = () => {
    if (currentUser?.role !== 'Central Admin') return;
    const current = backgroundHistory.find((h) => h.url === bgPhotoUrl);
    updateHistory(current ? [current] : []);
  };

  const setBgPhotoUrl = (url: string, name?: string, source: 'upload' | 'preset' = 'upload') => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgPhotoUrlState(url);
    setBgActiveState(true);
    supabaseDb.setSetting('silago_bg_photo_url', url);
    supabaseDb.setSetting('silago_bg_active', 'true');
    addToBackgroundHistory(url, name, source);
  };

  const setBgOpacity = (val: number) => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgOpacityState(val);
    supabaseDb.setSetting('silago_bg_opacity', val);
  };

  const setBgBlur = (val: number) => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgBlurState(val);
    supabaseDb.setSetting('silago_bg_blur', val);
  };

  const setBgActive = (val: boolean) => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgActiveState(val);
    supabaseDb.setSetting('silago_bg_active', val);
  };

  const removeBgPhoto = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgActiveState(false);
    supabaseDb.setSetting('silago_bg_active', false);
  };

  // Logos Settings (Synchronously Hydrated from LocalStorage + Supabase Cloud)
  const [daLogoUrl, setDaLogoUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_da_logo_url') || null; } catch { return null; }
  });
  const [silagoLogoUrl, setSilagoLogoUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_seal_url') || null; } catch { return null; }
  });
  const [bagOngSilagoLogoUrl, setBagOngSilagoLogoUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_bag_ong_logo_url') || null; } catch { return null; }
  });
  const [southernLeyteLogoUrl, setSouthernLeyteLogoUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_southern_leyte_logo_url') || null; } catch { return null; }
  });
  const [bagongPilipinasLogoUrl, setBagongPilipinasLogoUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_bagong_pilipinas_logo_url') || null; } catch { return null; }
  });
  const [portalBannerUrl, setPortalBannerUrlState] = useState<string | null>(() => {
    try { return localStorage.getItem('silago_portal_banner_url') || null; } catch { return null; }
  });

  const setDaLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setDaLogoUrlState(url);
    try {
      if (url) localStorage.setItem('silago_da_logo_url', url);
      else localStorage.removeItem('silago_da_logo_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_da_logo_url', url);
    else supabaseDb.removeSetting('silago_da_logo_url');
  };

  const setSilagoLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSilagoLogoUrlState(url);
    try {
      if (url) localStorage.setItem('silago_seal_url', url);
      else localStorage.removeItem('silago_seal_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_seal_url', url);
    else supabaseDb.removeSetting('silago_seal_url');
  };

  const setBagOngSilagoLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setBagOngSilagoLogoUrlState(url);
    try {
      if (url) localStorage.setItem('silago_bag_ong_logo_url', url);
      else localStorage.removeItem('silago_bag_ong_logo_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_bag_ong_logo_url', url);
    else supabaseDb.removeSetting('silago_bag_ong_logo_url');
  };

  const setSouthernLeyteLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSouthernLeyteLogoUrlState(url);
    try {
      if (url) localStorage.setItem('silago_southern_leyte_logo_url', url);
      else localStorage.removeItem('silago_southern_leyte_logo_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_southern_leyte_logo_url', url);
    else supabaseDb.removeSetting('silago_southern_leyte_logo_url');
  };

  const setBagongPilipinasLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setBagongPilipinasLogoUrlState(url);
    try {
      if (url) localStorage.setItem('silago_bagong_pilipinas_logo_url', url);
      else localStorage.removeItem('silago_bagong_pilipinas_logo_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_bagong_pilipinas_logo_url', url);
    else supabaseDb.removeSetting('silago_bagong_pilipinas_logo_url');
  };

  const setPortalBannerUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setPortalBannerUrlState(url);
    try {
      if (url) localStorage.setItem('silago_portal_banner_url', url);
      else localStorage.removeItem('silago_portal_banner_url');
    } catch {}
    if (url) supabaseDb.setSetting('silago_portal_banner_url', url);
    else supabaseDb.removeSetting('silago_portal_banner_url');
  };

  const updateSystemLogo = (key: keyof SystemLogos, url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    switch (key) {
      case 'daLogoUrl': setDaLogoUrl(url); break;
      case 'silagoLogoUrl': setSilagoLogoUrl(url); break;
      case 'bagOngSilagoLogoUrl': setBagOngSilagoLogoUrl(url); break;
      case 'southernLeyteLogoUrl': setSouthernLeyteLogoUrl(url); break;
      case 'bagongPilipinasLogoUrl': setBagongPilipinasLogoUrl(url); break;
      case 'portalBannerUrl': setPortalBannerUrl(url); break;
    }
  };

  const setSystemLogos = (logos: Partial<SystemLogos>) => {
    if (currentUser?.role !== 'Central Admin') return;
    if (logos.daLogoUrl !== undefined) setDaLogoUrl(logos.daLogoUrl);
    if (logos.silagoLogoUrl !== undefined) setSilagoLogoUrl(logos.silagoLogoUrl);
    if (logos.bagOngSilagoLogoUrl !== undefined) setBagOngSilagoLogoUrl(logos.bagOngSilagoLogoUrl);
    if (logos.southernLeyteLogoUrl !== undefined) setSouthernLeyteLogoUrl(logos.southernLeyteLogoUrl);
    if (logos.bagongPilipinasLogoUrl !== undefined) setBagongPilipinasLogoUrl(logos.bagongPilipinasLogoUrl);
    if (logos.portalBannerUrl !== undefined) setPortalBannerUrl(logos.portalBannerUrl);
  };

  const systemLogos: SystemLogos = useMemo(() => ({
    daLogoUrl,
    silagoLogoUrl,
    bagOngSilagoLogoUrl,
    southernLeyteLogoUrl,
    bagongPilipinasLogoUrl,
    portalBannerUrl
  }), [daLogoUrl, silagoLogoUrl, bagOngSilagoLogoUrl, southernLeyteLogoUrl, bagongPilipinasLogoUrl, portalBannerUrl]);

  const resetLogos = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setDaLogoUrl(null);
    setSilagoLogoUrl(null);
    setBagOngSilagoLogoUrl(null);
    setSouthernLeyteLogoUrl(null);
    setBagongPilipinasLogoUrl(null);
    setPortalBannerUrl(null);
    try {
      localStorage.removeItem('silago_da_logo_url');
      localStorage.removeItem('silago_seal_url');
      localStorage.removeItem('silago_bag_ong_logo_url');
      localStorage.removeItem('silago_southern_leyte_logo_url');
      localStorage.removeItem('silago_bagong_pilipinas_logo_url');
      localStorage.removeItem('silago_portal_banner_url');
    } catch {}
    supabaseDb.removeSetting('silago_da_logo_url');
    supabaseDb.removeSetting('silago_seal_url');
    supabaseDb.removeSetting('silago_bag_ong_logo_url');
    supabaseDb.removeSetting('silago_southern_leyte_logo_url');
    supabaseDb.removeSetting('silago_bagong_pilipinas_logo_url');
    supabaseDb.removeSetting('silago_portal_banner_url');
  };

  // Sync custom logos with report export engine cache
  useEffect(() => {
    setReportCustomLogoCache({
      silago_da_logo_url: daLogoUrl,
      silago_seal_url: silagoLogoUrl,
      silago_bag_ong_logo_url: bagOngSilagoLogoUrl,
      silago_southern_leyte_logo_url: southernLeyteLogoUrl,
      silago_bagong_pilipinas_logo_url: bagongPilipinasLogoUrl,
      silago_portal_banner_url: portalBannerUrl
    });
  }, [daLogoUrl, silagoLogoUrl, bagOngSilagoLogoUrl, southernLeyteLogoUrl, bagongPilipinasLogoUrl, portalBannerUrl]);

  // Central Administrator Profile & Password
  const [adminProfile, setAdminProfile] = useState<{
    name: string;
    title: string;
    email: string;
    contactNumber: string;
    office: string;
    photoUrl?: string;
  }>({
    name: 'Municipal Administrator',
    title: 'Municipal Agriculturist / MAO Administrator',
    email: 'admin@gmail.com',
    contactNumber: '',
    office: 'Silago Municipal Agriculture Office (DA-MAO)',
    photoUrl: ''
  });

  const updateAdminProfile = (data: Partial<typeof adminProfile>) => {
    if (currentUser?.role !== 'Central Admin') return;
    const updated = { ...adminProfile, ...data };
    setAdminProfile(updated);
    supabaseDb.setSetting('silago_admin_profile', updated);

    // If currently logged in as Central Admin, update currentUser state
    if (currentUser?.role === 'Central Admin') {
      const updatedUser: User = {
        ...currentUser,
        name: updated.name,
        title: updated.title,
        email: updated.email,
        contactNumber: updated.contactNumber,
        office: updated.office,
        photoUrl: updated.photoUrl
      };
      setCurrentUser(updatedUser);
    }
  };

  const updateCurrentUserProfile = (data: Partial<User>) => {
    if (!currentUser) return;
    // Do not allow privilege escalation via profile update
    const { role: _ignoredRole, assignedBarangays: _ignoredBrgys, username: _ignoredUser, ...safeProfileData } = data;
    const updatedUser: User = {
      ...currentUser,
      ...safeProfileData
    };
    setCurrentUser(updatedUser);

    if (currentUser.role === 'Central Admin') {
      updateAdminProfile({
        name: updatedUser.name,
        title: updatedUser.title,
        email: updatedUser.email,
        contactNumber: updatedUser.contactNumber,
        office: updatedUser.office,
        photoUrl: updatedUser.photoUrl
      });
    } else {
      const matchingAccount = lftAccounts.find(
        (acc) => acc.username === currentUser.username || acc.name === currentUser.name
      );
      if (matchingAccount) {
        updateLftAccount(matchingAccount.id, {
          name: updatedUser.name,
          contactNumber: updatedUser.contactNumber || matchingAccount.contactNumber,
          email: updatedUser.email || matchingAccount.email
        });
      }
    }
  };

  const updateCurrentUserPassword = async (currentPassword: string, newPassword: string): Promise<string | null> => {
    if (!currentUser) return 'Sign in before changing your password.';
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user || user.is_anonymous) return 'Sign in before changing your password.';
      const credentials = user.email ? { email: user.email } : { phone: user.phone || '' };
      const { error: verificationError } = await supabase.auth.signInWithPassword({
        ...credentials,
        password: currentPassword
      });
      if (verificationError) return 'Unable to verify the current password.';
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        current_password: currentPassword
      });
      return error?.message || null;
    } catch {
      return 'Unable to change your password. Check your connection and try again.';
    }
  };

  // SLSU Center Settings
  const [slsuPhotoUrl, setSlsuPhotoUrlState] = useState<string>(DEFAULT_SLSU_PHOTO);
  const [slsuLayoutMode, setSlsuLayoutModeState] = useState<'banner' | 'full' | 'seal'>('full');
  const [slsuCaption, setSlsuCaptionState] = useState<string>(SLSU_DEFAULTS.caption);
  const [slsuSealLogoUrl, setSlsuSealLogoUrlState] = useState<string | null>(null);
  const [slsuUniversityName, setSlsuUniversityNameState] = useState<string>(SLSU_DEFAULTS.universityName);
  const [slsuMotto, setSlsuMottoState] = useState<string>(SLSU_DEFAULTS.motto);
  const [slsuYear, setSlsuYearState] = useState<string>(SLSU_DEFAULTS.year);
  const [slsuCenterTitle, setSlsuCenterTitleState] = useState<string>(SLSU_DEFAULTS.centerTitle);
  const [slsuCenterSubtitle, setSlsuCenterSubtitleState] = useState<string>(SLSU_DEFAULTS.centerSubtitle);
  const [slsuBadgeTag, setSlsuBadgeTagState] = useState<string>(SLSU_DEFAULTS.badgeTag || 'SILAGO RICE DEMONSTRATION COMPLEX');
  const [slsuTopTags, setSlsuTopTagsState] = useState<string>(SLSU_DEFAULTS.topTags || '• HIGH YIELD • CERTIFIED SEED • CLIMATE RESILIENT •');
  const [settingsActiveSubTab, setSettingsActiveSubTab] = useState<'profile' | 'municipal' | 'featured_card' | 'display' | 'media' | 'landing'>('media');

  // Office Hours & Hotline Settings (Central Admin Managed)
  const [officeContactInfo, setOfficeContactInfoState] = useState<OfficeContactInfo>(DEFAULT_OFFICE_CONTACT_INFO);

  const updateOfficeContactInfo = (info: Partial<OfficeContactInfo>) => {
    if (currentUser?.role !== 'Central Admin') return;
    setOfficeContactInfoState((prev) => {
      const updated = { ...prev, ...info };
      supabaseDb.setSetting('silago_office_contact_info', updated);
      return updated;
    });
  };

  const resetOfficeContactInfo = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setOfficeContactInfoState(DEFAULT_OFFICE_CONTACT_INFO);
    supabaseDb.setSetting('silago_office_contact_info', DEFAULT_OFFICE_CONTACT_INFO);
  };

  // Municipal Branding & System Identification Settings
  const [municipalBranding, setMunicipalBrandingState] = useState<MunicipalBrandingSettings>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_municipal_branding');
        if (cached) {
          const parsed = JSON.parse(cached);
          return { ...DEFAULT_MUNICIPAL_BRANDING, ...parsed };
        }
      }
    } catch {}
    return DEFAULT_MUNICIPAL_BRANDING;
  });

  const updateMunicipalBranding = (branding: Partial<MunicipalBrandingSettings>) => {
    if (currentUser?.role !== 'Central Admin') return;
    setMunicipalBrandingState((prev) => {
      const updated = { ...prev, ...branding };
      try {
        localStorage.setItem('silago_municipal_branding', JSON.stringify(updated));
      } catch {}
      supabaseDb.setSetting('silago_municipal_branding', updated);

      // Keep legacy seal and logo states synchronized
      if (branding.silagoSealUrl !== undefined) {
        setSilagoLogoUrl(branding.silagoSealUrl);
      }
      if (branding.bagOngSilagoLogoUrl !== undefined) {
        setBagOngSilagoLogoUrl(branding.bagOngSilagoLogoUrl);
      }
      if (branding.daLogoUrl !== undefined) {
        setDaLogoUrl(branding.daLogoUrl);
      }

      return updated;
    });
  };

  const resetMunicipalBranding = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setMunicipalBrandingState(DEFAULT_MUNICIPAL_BRANDING);
    try {
      localStorage.removeItem('silago_municipal_branding');
    } catch {}
    supabaseDb.setSetting('silago_municipal_branding', DEFAULT_MUNICIPAL_BRANDING);
    setSilagoLogoUrl(null);
    setBagOngSilagoLogoUrl(null);
    setDaLogoUrl(null);
  };

  // Landing Page Dynamic Configuration State
  const [landingPageConfig, setLandingPageConfigState] = useState<LandingPageConfig>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_landing_page_config');
        if (cached) {
          const parsed = JSON.parse(cached);
          return {
            ...DEFAULT_LANDING_PAGE_CONFIG,
            ...parsed,
            mandateCards: Array.isArray(parsed.mandateCards) && parsed.mandateCards.length > 0
              ? parsed.mandateCards
              : DEFAULT_LANDING_PAGE_CONFIG.mandateCards
          };
        }
      }
    } catch {}
    return DEFAULT_LANDING_PAGE_CONFIG;
  });

  const updateLandingPageConfig = (config: Partial<LandingPageConfig>) => {
    if (currentUser?.role !== 'Central Admin') return;
    setLandingPageConfigState((prev) => {
      const updated = { ...prev, ...config };
      try {
        localStorage.setItem('silago_landing_page_config', JSON.stringify(updated));
      } catch {}
      supabaseDb.setSetting('silago_landing_page_config', updated);
      return updated;
    });
  };

  const resetLandingPageConfig = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setLandingPageConfigState(DEFAULT_LANDING_PAGE_CONFIG);
    try {
      localStorage.removeItem('silago_landing_page_config');
    } catch {}
    supabaseDb.setSetting('silago_landing_page_config', DEFAULT_LANDING_PAGE_CONFIG);
  };

  // Official Legal Decrees & Ordinances Registry (Visible in both Portal & Public Interface)
  const [legalDecrees, setLegalDecreesState] = useState<LegalDecree[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_legal_decrees');
        if (cached) {
          return normalizeDecreeList(JSON.parse(cached));
        }
      }
    } catch {}
    return DEFAULT_LEGAL_DECREES;
  });

  const persistLegalDecrees = (next: LegalDecree[]) => {
    setLegalDecreesState(next);
    try {
      localStorage.setItem('silago_legal_decrees', JSON.stringify(next));
    } catch {}
    supabaseDb.setSetting('silago_legal_decrees', next);
  };

  const addLegalDecree = (decree: Omit<LegalDecree, 'id'>) => {
    if (currentUser?.role !== 'Central Admin') return;
    const created: LegalDecree = {
      ...decree,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `decree-${Date.now()}`
    };
    persistLegalDecrees([created, ...legalDecrees]);
  };

  const updateLegalDecree = (id: string, updated: Partial<LegalDecree>) => {
    if (currentUser?.role !== 'Central Admin') return;
    persistLegalDecrees(legalDecrees.map((d) => (d.id === id ? { ...d, ...updated } : d)));
  };

  const deleteLegalDecree = (id: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    persistLegalDecrees(legalDecrees.filter((d) => d.id !== id));
  };

  const resetLegalDecrees = () => {
    if (currentUser?.role !== 'Central Admin') return;
    persistLegalDecrees(DEFAULT_LEGAL_DECREES);
  };

  // Government Agricultural Subsidies (Seedlings / Fertilizer) & Owner Claim Tracking
  const [subsidyPrograms, setSubsidyProgramsState] = useState<GovernmentSubsidyProgram[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_subsidy_programs');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch {}
    return DEFAULT_SUBSIDY_PROGRAMS;
  });

  const [subsidyClaims, setSubsidyClaimsState] = useState<SubsidyClaimRecord[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_subsidy_claims');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {}
    return [];
  });

  const [subsidyHistory, setSubsidyHistoryState] = useState<SubsidyHistoryEntry[]>(() => {
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('silago_subsidy_history');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {}
    return [];
  });

  const persistSubsidyPrograms = (next: GovernmentSubsidyProgram[]) => {
    setSubsidyProgramsState(next);
    try {
      localStorage.setItem('silago_subsidy_programs', JSON.stringify(next));
    } catch {}
    supabaseDb.setSetting('silago_subsidy_programs', next);
  };

  const persistSubsidyClaims = (next: SubsidyClaimRecord[]) => {
    setSubsidyClaimsState(next);
    try {
      localStorage.setItem('silago_subsidy_claims', JSON.stringify(next));
    } catch {}
    supabaseDb.setSetting('silago_subsidy_claims', next);
  };

  const persistSubsidyHistory = (next: SubsidyHistoryEntry[]) => {
    setSubsidyHistoryState(next);
    try {
      localStorage.setItem('silago_subsidy_history', JSON.stringify(next));
    } catch {}
    supabaseDb.setSetting('silago_subsidy_history', next);
  };

  const addSubsidyProgram = (program: Omit<GovernmentSubsidyProgram, 'id' | 'createdAt'>): GovernmentSubsidyProgram => {
    const created: GovernmentSubsidyProgram = {
      ...program,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? `prog-${crypto.randomUUID()}` : `prog-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    if (currentUser) {
      persistSubsidyPrograms([created, ...subsidyPrograms]);
    }
    return created;
  };

  const updateSubsidyProgram = (id: string, updated: Partial<GovernmentSubsidyProgram>) => {
    if (currentUser?.role !== 'Central Admin') return;
    persistSubsidyPrograms(subsidyPrograms.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  };

  const deleteSubsidyProgram = (id: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    persistSubsidyPrograms(subsidyPrograms.filter((p) => p.id !== id));
    persistSubsidyClaims(subsidyClaims.filter((c) => c.programId !== id));
  };

  const buildClaimRecord = (
    programId: string,
    parcel: FarmParcel,
    data: {
      claimed: boolean;
      inputType?: SubsidyCategory;
      itemGiven?: string;
      claimedAt?: string;
      quantityReceived?: string;
      releasedBy?: string;
      slipOrVoucherNo?: string;
      recipientName?: string;
      remarks?: string;
    },
    existing?: SubsidyClaimRecord
  ): SubsidyClaimRecord => {
    const today = new Date().toISOString().split('T')[0];
    const program = subsidyPrograms.find((p) => p.id === programId);
    const resolvedType = data.inputType || existing?.inputType || program?.category || 'Seedlings / Seeds';
    const resolvedItem = data.itemGiven ?? existing?.itemGiven ?? program?.itemDescription ?? program?.title ?? '';
    return {
      id: `${programId}::${parcel.tagNumber}`,
      programId,
      parcelTag: parcel.tagNumber,
      rsbsaNo: parcel.swineNameOrId || parcel.rsbsa_no || '',
      ownerName: parcel.raiserName,
      barangay: parcel.barangay,
      claimed: data.claimed,
      inputType: resolvedType,
      itemGiven: resolvedItem,
      claimedAt: data.claimed ? (data.claimedAt || existing?.claimedAt || today) : '',
      quantityReceived: data.claimed ? (data.quantityReceived ?? existing?.quantityReceived ?? '') : '',
      releasedBy: data.claimed ? (data.releasedBy || existing?.releasedBy || currentUser?.name || 'MAO Staff') : '',
      slipOrVoucherNo: data.claimed ? (data.slipOrVoucherNo ?? existing?.slipOrVoucherNo ?? '') : '',
      recipientName: data.claimed
        ? ((data.recipientName ?? existing?.recipientName ?? 'Owner (Self)').trim() || 'Owner (Self)')
        : '',
      remarks: data.remarks ?? existing?.remarks ?? '',
      updatedAt: new Date().toISOString()
    };
  };

  const syncHistoryForClaim = (record: SubsidyClaimRecord, currentHistory: SubsidyHistoryEntry[]) => {
    const historyId = `hist::${record.id}`;
    const program = subsidyPrograms.find((p) => p.id === record.programId);
    if (!record.claimed) {
      return currentHistory.filter((h) => h.id !== historyId);
    }
    const entry: SubsidyHistoryEntry = {
      id: historyId,
      programId: record.programId,
      programTitle: program?.title || 'Government Assistance Program',
      fundingSource: program?.fundingSource || 'DA / LGU-Silago',
      parcelTag: record.parcelTag,
      rsbsaNo: record.rsbsaNo,
      ownerName: record.ownerName,
      barangay: record.barangay,
      inputType: record.inputType || program?.category || 'Seedlings / Seeds',
      itemGiven: record.itemGiven || program?.itemDescription || program?.title || 'Agricultural Input',
      quantityGiven: record.quantityReceived || program?.defaultQuantity || '1 unit',
      dateGiven: record.claimedAt || new Date().toISOString().split('T')[0],
      releasedBy: record.releasedBy || currentUser?.name || 'MAO Staff',
      slipOrVoucherNo: record.slipOrVoucherNo || '',
      recipientName: record.recipientName || 'Owner (Self)',
      remarks: record.remarks || '',
      recordedAt: new Date().toISOString()
    };
    const exists = currentHistory.some((h) => h.id === historyId);
    return exists
      ? currentHistory.map((h) => (h.id === historyId ? entry : h))
      : [entry, ...currentHistory];
  };

  const setOwnerSubsidyClaim = (
    programId: string,
    parcel: FarmParcel,
    data: {
      claimed: boolean;
      inputType?: SubsidyCategory;
      itemGiven?: string;
      claimedAt?: string;
      quantityReceived?: string;
      releasedBy?: string;
      slipOrVoucherNo?: string;
      recipientName?: string;
      remarks?: string;
    }
  ) => {
    if (!currentUser || !isUserAuthorizedForBarangay(currentUser, parcel.barangay)) return;
    const claimId = `${programId}::${parcel.tagNumber}`;
    const existing = subsidyClaims.find((c) => c.id === claimId);
    const updatedRecord = buildClaimRecord(programId, parcel, data, existing);
    const nextClaims = existing
      ? subsidyClaims.map((c) => (c.id === claimId ? updatedRecord : c))
      : [updatedRecord, ...subsidyClaims];
    persistSubsidyClaims(nextClaims);
    persistSubsidyHistory(syncHistoryForClaim(updatedRecord, subsidyHistory));
  };

  const bulkMarkSubsidyClaims = (
    programId: string,
    targetParcels: FarmParcel[],
    claimed: boolean,
    defaultQuantity = '',
    claimedAtOverride?: string,
    inputTypeOverride?: SubsidyCategory,
    itemGivenOverride?: string
  ) => {
    if (!currentUser || targetParcels.length === 0) return;
    const authorized = targetParcels.filter((p) => isUserAuthorizedForBarangay(currentUser, p.barangay));
    if (authorized.length === 0) return;
    const claimMap = new Map<string, SubsidyClaimRecord>(subsidyClaims.map((c) => [c.id, c]));
    let nextHistory = [...subsidyHistory];
    for (const parcel of authorized) {
      const claimId = `${programId}::${parcel.tagNumber}`;
      const existing = claimMap.get(claimId);
      const updated = buildClaimRecord(
        programId,
        parcel,
        {
          claimed,
          inputType: inputTypeOverride,
          itemGiven: itemGivenOverride,
          claimedAt: claimedAtOverride,
          quantityReceived: claimed ? existing?.quantityReceived || defaultQuantity : ''
        },
        existing
      );
      claimMap.set(claimId, updated);
      nextHistory = syncHistoryForClaim(updated, nextHistory);
    }
    persistSubsidyClaims(Array.from(claimMap.values()));
    persistSubsidyHistory(nextHistory);
  };

  const addSubsidyHistoryEntry = (
    entry: Omit<SubsidyHistoryEntry, 'id' | 'recordedAt'>,
    parcel?: FarmParcel
  ): SubsidyHistoryEntry | null => {
    const targetBarangay = parcel?.barangay || entry.barangay;
    if (!currentUser || !isUserAuthorizedForBarangay(currentUser, targetBarangay)) return null;
    const created: SubsidyHistoryEntry = {
      ...entry,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? `hist-${crypto.randomUUID()}` : `hist-${Date.now()}`,
      recordedAt: new Date().toISOString()
    };
    persistSubsidyHistory([created, ...subsidyHistory]);
    return created;
  };

  const deleteSubsidyHistoryEntry = (entryId: string) => {
    if (!currentUser) return;
    const target = subsidyHistory.find((h) => h.id === entryId);
    if (!target || !isUserAuthorizedForBarangay(currentUser, target.barangay)) return;
    persistSubsidyHistory(subsidyHistory.filter((h) => h.id !== entryId));
  };

  const addMandateCard = (card: Omit<MandateCardItem, 'id'>) => {
    if (currentUser?.role !== 'Central Admin') return;
    const newCard: MandateCardItem = {
      ...card,
      id: `mandate-${Date.now()}`
    };
    setLandingPageConfigState((prev) => {
      const updated = {
        ...prev,
        mandateCards: [...prev.mandateCards, newCard]
      };
      try {
        localStorage.setItem('silago_landing_page_config', JSON.stringify(updated));
      } catch {}
      supabaseDb.setSetting('silago_landing_page_config', updated);
      return updated;
    });
  };

  const updateMandateCard = (id: string, updated: Partial<MandateCardItem>) => {
    if (currentUser?.role !== 'Central Admin') return;
    setLandingPageConfigState((prev) => {
      const updatedCards = prev.mandateCards.map((c) => (c.id === id ? { ...c, ...updated } : c));
      const nextConfig = {
        ...prev,
        mandateCards: updatedCards
      };
      try {
        localStorage.setItem('silago_landing_page_config', JSON.stringify(nextConfig));
      } catch {}
      supabaseDb.setSetting('silago_landing_page_config', nextConfig);
      return nextConfig;
    });
  };

  const deleteMandateCard = (id: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setLandingPageConfigState((prev) => {
      const updatedCards = prev.mandateCards.filter((c) => c.id !== id);
      const nextConfig = {
        ...prev,
        mandateCards: updatedCards
      };
      try {
        localStorage.setItem('silago_landing_page_config', JSON.stringify(nextConfig));
      } catch {}
      supabaseDb.setSetting('silago_landing_page_config', nextConfig);
      return nextConfig;
    });
  };

  const setSlsuPhotoUrl = (url: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuPhotoUrlState(url);
    supabaseDb.setSetting('silago_slsu_photo_url', url);
  };
  const setSlsuLayoutMode = (mode: 'banner' | 'full' | 'seal') => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuLayoutModeState(mode);
    supabaseDb.setSetting('silago_slsu_layout_mode', mode);
  };
  const setSlsuCaption = (cap: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuCaptionState(cap);
    supabaseDb.setSetting('silago_slsu_caption', cap);
  };
  const setSlsuSealLogoUrl = (url: string | null) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuSealLogoUrlState(url);
    if (url) supabaseDb.setSetting('silago_slsu_seal_logo_url', url);
    else supabaseDb.removeSetting('silago_slsu_seal_logo_url');
  };
  const setSlsuUniversityName = (name: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuUniversityNameState(name);
    supabaseDb.setSetting('silago_slsu_university_name', name);
  };
  const setSlsuMotto = (motto: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuMottoState(motto);
    supabaseDb.setSetting('silago_slsu_motto', motto);
  };
  const setSlsuYear = (year: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuYearState(year);
    supabaseDb.setSetting('silago_slsu_year', year);
  };
  const setSlsuCenterTitle = (title: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuCenterTitleState(title);
    supabaseDb.setSetting('silago_slsu_center_title', title);
  };
  const setSlsuCenterSubtitle = (sub: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuCenterSubtitleState(sub);
    supabaseDb.setSetting('silago_slsu_center_subtitle', sub);
  };
  const setSlsuBadgeTag = (tag: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuBadgeTagState(tag);
    supabaseDb.setSetting('silago_slsu_badge_tag', tag);
  };
  const setSlsuTopTags = (tags: string) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuTopTagsState(tags);
    supabaseDb.setSetting('silago_slsu_top_tags', tags);
  };

  const resetSlsuDetails = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setSlsuUniversityNameState(SLSU_DEFAULTS.universityName);
    setSlsuMottoState(SLSU_DEFAULTS.motto);
    setSlsuYearState(SLSU_DEFAULTS.year);
    setSlsuCenterTitleState(SLSU_DEFAULTS.centerTitle);
    setSlsuCenterSubtitleState(SLSU_DEFAULTS.centerSubtitle);
    setSlsuBadgeTagState(SLSU_DEFAULTS.badgeTag || 'SILAGO RICE DEMONSTRATION COMPLEX');
    setSlsuTopTagsState(SLSU_DEFAULTS.topTags || '• HIGH YIELD • CERTIFIED SEED • CLIMATE RESILIENT •');
    setSlsuSealLogoUrlState(null);
    setSlsuPhotoUrlState(DEFAULT_SLSU_PHOTO);
    setSlsuCaptionState(SLSU_DEFAULTS.caption);
    supabaseDb.removeSetting('silago_slsu_university_name');
    supabaseDb.removeSetting('silago_slsu_motto');
    supabaseDb.removeSetting('silago_slsu_year');
    supabaseDb.removeSetting('silago_slsu_center_title');
    supabaseDb.removeSetting('silago_slsu_center_subtitle');
    supabaseDb.removeSetting('silago_slsu_badge_tag');
    supabaseDb.removeSetting('silago_slsu_top_tags');
    supabaseDb.removeSetting('silago_slsu_seal_logo_url');
    supabaseDb.removeSetting('silago_slsu_photo_url');
    supabaseDb.removeSetting('silago_slsu_caption');
  };

  const resetAllDefaults = () => {
    if (currentUser?.role !== 'Central Admin') return;
    setBgPhotoUrlState(DEFAULT_BG_PHOTO);
    setBgOpacityState(0.09);
    setBgBlurState(1);
    setBgActiveState(false);
    resetLogos();
    resetSlsuDetails();
    updateHistory(PRESET_BACKGROUNDS);
    setParcels([]);
    setCurrentUser(null);
    setLanguageState('EN');
  };

  // ==========================================
  // DYNAMIC REFERENCE DATA (ADD, EDIT, DELETE)
  // ==========================================

  // 1. Rice Varieties
  const [varieties, setVarieties] = useState<RiceVariety[]>(RICE_VARIETIES);

  const saveVarieties = (newVarieties: RiceVariety[]) => {
    if (currentUser?.role !== 'Central Admin') return;
    const updated = mergeRequiredRiceVarieties(newVarieties);
    setVarieties(updated);
    supabaseDb.setSetting('silago_rice_varieties', updated);
  };

  const addVariety = (variety: RiceVariety) => {
    const updated = [variety, ...varieties.filter((v) => v.name.toLowerCase() !== variety.name.toLowerCase())];
    saveVarieties(updated);
  };

  const updateVariety = (oldName: string, updatedFields: Partial<RiceVariety>) => {
    const updated = varieties.map((v) => (v.name === oldName ? { ...v, ...updatedFields } : v));
    saveVarieties(updated);
  };

  const deleteVariety = (name: string) => {
    const updated = varieties.filter((v) => v.name !== name);
    saveVarieties(updated);
  };

  // 2. Agro-Ecosystems
  const [ecosystems, setEcosystems] = useState<string[]>(DEFAULT_ECOSYSTEMS);

  const saveEcosystems = (items: string[]) => {
    if (currentUser?.role !== 'Central Admin') return;
    setEcosystems(items);
    supabaseDb.setSetting('silago_ecosystems', items);
  };

  const addEcosystem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || ecosystems.includes(trimmed)) return;
    saveEcosystems([...ecosystems, trimmed]);
  };

  const updateEcosystem = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    saveEcosystems(ecosystems.map((e) => (e === oldName ? trimmed : e)));
  };

  const deleteEcosystem = (name: string) => {
    saveEcosystems(ecosystems.filter((e) => e !== name));
  };

  // 3. Tenurial Statuses
  const [tenures, setTenures] = useState<string[]>(DEFAULT_TENURES);

  const saveTenures = (items: string[]) => {
    if (currentUser?.role !== 'Central Admin') return;
    setTenures(items);
    supabaseDb.setSetting('silago_tenures', items);
  };

  const addTenure = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || tenures.includes(trimmed)) return;
    saveTenures([...tenures, trimmed]);
  };

  const updateTenure = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    saveTenures(tenures.map((t) => (t === oldName ? trimmed : t)));
  };

  const deleteTenure = (name: string) => {
    saveTenures(tenures.filter((t) => t !== name));
  };

  // 4. Cropping Seasons
  const [seasons, setSeasons] = useState<string[]>(DEFAULT_SEASONS);

  const saveSeasons = (items: string[]) => {
    if (currentUser?.role !== 'Central Admin') return;
    setSeasons(items);
    supabaseDb.setSetting('silago_seasons', items);
  };

  const addSeason = (name: string) => {
    const trimmed = name.trim();
    if (!getSeasonIdentity(trimmed) || seasons.some((season) => matchesSeasonFilter(season, trimmed))) return;
    saveSeasons(getSeasonOptions([...seasons, trimmed]));
  };

  const updateSeason = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!getSeasonIdentity(trimmed) || seasons.some((season) => season !== oldName && matchesSeasonFilter(season, trimmed))) return;
    saveSeasons(getSeasonOptions(seasons.map((season) => season === oldName ? trimmed : season)));
  };

  const deleteSeason = (name: string) => {
    saveSeasons(seasons.filter((s) => s !== name));
  };

  // 5. Irrigation Associations (IA)
  const [irrigationAssociations, setIrrigationAssociations] = useState<string[]>(DEFAULT_IRRIGATION_ASSOCIATIONS);

  const saveIrrigationAssociations = (items: string[]) => {
    if (currentUser?.role !== 'Central Admin') return;
    setIrrigationAssociations(items);
    supabaseDb.setSetting('silago_irrigation_associations', items);
  };

  const addIrrigationAssociation = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || irrigationAssociations.includes(trimmed)) return;
    saveIrrigationAssociations([...irrigationAssociations, trimmed]);
  };

  const updateIrrigationAssociation = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    saveIrrigationAssociations(irrigationAssociations.map((ia) => (ia === oldName ? trimmed : ia)));
  };

  const deleteIrrigationAssociation = (name: string) => {
    saveIrrigationAssociations(irrigationAssociations.filter((ia) => ia !== name));
  };

  // Initial Cloud Database Hydration for Settings and Custom Branding
  useEffect(() => {
    let isMounted = true;

    const loadSettingsFromCloud = async () => {
      try {
        const [
          cloudLang,
          cloudBgPhoto,
          cloudBgOpacity,
          cloudBgBlur,
          cloudBgActive,
          cloudBgHistory,
          cloudDaLogo,
          cloudSeal,
          cloudBagOng,
          cloudSouthernLeyte,
          cloudBagongPilipinas,
          cloudPortalBanner,
          cloudAdminProfile,
          cloudOfficeContact,
          cloudVarieties,
          cloudEcosystems,
          cloudTenures,
          cloudSeasons,
          cloudIAs,
          cloudSlsuPhoto,
          cloudSlsuLayout,
          cloudSlsuCaption,
          cloudSlsuSeal,
          cloudSlsuTitle,
          cloudSlsuSubtitle,
          cloudSlsuBadge,
          cloudSlsuTags,
          cloudMunicipalBranding,
          cloudLandingPageConfig,
          cloudLegalDecrees,
          cloudSubsidyPrograms,
          cloudSubsidyClaims,
          cloudSubsidyHistory,
          cloudFormSchema,
          cloudParcelCustomFields
        ] = await Promise.all([
          supabaseDb.getSetting<Language>('silago_language'),
          supabaseDb.getSetting<string>('silago_bg_photo_url'),
          supabaseDb.getSetting<number>('silago_bg_opacity'),
          supabaseDb.getSetting<number>('silago_bg_blur'),
          supabaseDb.getSetting<boolean | string>('silago_bg_active'),
          supabaseDb.getSetting<BackgroundPreset[]>('silago_bg_history'),
          supabaseDb.getSetting<string>('silago_da_logo_url'),
          supabaseDb.getSetting<string>('silago_seal_url'),
          supabaseDb.getSetting<string>('silago_bag_ong_logo_url'),
          supabaseDb.getSetting<string>('silago_southern_leyte_logo_url'),
          supabaseDb.getSetting<string>('silago_bagong_pilipinas_logo_url'),
          supabaseDb.getSetting<string>('silago_portal_banner_url'),
          supabaseDb.getSetting<typeof adminProfile>('silago_admin_profile'),
          supabaseDb.getSetting<OfficeContactInfo>('silago_office_contact_info'),
          supabaseDb.getSetting<RiceVariety[]>('silago_rice_varieties'),
          supabaseDb.getSetting<string[]>('silago_ecosystems'),
          supabaseDb.getSetting<string[]>('silago_tenures'),
          supabaseDb.getSetting<string[]>('silago_seasons'),
          supabaseDb.getSetting<string[]>('silago_irrigation_associations'),
          supabaseDb.getSetting<string>('silago_slsu_photo_url'),
          supabaseDb.getSetting<'banner' | 'full' | 'seal'>('silago_slsu_layout_mode'),
          supabaseDb.getSetting<string>('silago_slsu_caption'),
          supabaseDb.getSetting<string>('silago_slsu_seal_logo_url'),
          supabaseDb.getSetting<string>('silago_slsu_center_title'),
          supabaseDb.getSetting<string>('silago_slsu_center_subtitle'),
          supabaseDb.getSetting<string>('silago_slsu_badge_tag'),
          supabaseDb.getSetting<string>('silago_slsu_top_tags'),
          supabaseDb.getSetting<MunicipalBrandingSettings>('silago_municipal_branding'),
          supabaseDb.getSetting<LandingPageConfig>('silago_landing_page_config'),
          supabaseDb.getSetting<LegalDecree[]>('silago_legal_decrees'),
          supabaseDb.getSetting<GovernmentSubsidyProgram[]>('silago_subsidy_programs'),
          supabaseDb.getSetting<SubsidyClaimRecord[]>('silago_subsidy_claims'),
          supabaseDb.getSetting<SubsidyHistoryEntry[]>('silago_subsidy_history'),
          supabaseDb.getSetting<PersistedFormSchema>(FORM_SCHEMA_STORAGE_KEY),
          supabaseDb.getSetting<Record<string, Record<string, string>>>(PARCEL_CUSTOM_FIELDS_KEY)
        ]);

        if (!isMounted) return;

        if (cloudLang) setLanguageState(cloudLang === 'CEB' ? 'CEB' : 'EN');
        if (cloudBgPhoto) setBgPhotoUrlState(cloudBgPhoto);
        if (cloudBgOpacity !== null && cloudBgOpacity !== undefined) setBgOpacityState(Number(cloudBgOpacity));
        if (cloudBgBlur !== null && cloudBgBlur !== undefined) setBgBlurState(Number(cloudBgBlur));
        if (cloudBgActive !== null && cloudBgActive !== undefined) setBgActiveState(cloudBgActive === true || cloudBgActive === 'true');
        if (Array.isArray(cloudBgHistory) && cloudBgHistory.length > 0) setBackgroundHistory(cloudBgHistory);
        if (cloudDaLogo) { setDaLogoUrlState(cloudDaLogo); try { localStorage.setItem('silago_da_logo_url', cloudDaLogo); } catch {} }
        if (cloudSeal) { setSilagoLogoUrlState(cloudSeal); try { localStorage.setItem('silago_seal_url', cloudSeal); } catch {} }
        if (cloudBagOng) { setBagOngSilagoLogoUrlState(cloudBagOng); try { localStorage.setItem('silago_bag_ong_logo_url', cloudBagOng); } catch {} }
        if (cloudSouthernLeyte) { setSouthernLeyteLogoUrlState(cloudSouthernLeyte); try { localStorage.setItem('silago_southern_leyte_logo_url', cloudSouthernLeyte); } catch {} }
        if (cloudBagongPilipinas) { setBagongPilipinasLogoUrlState(cloudBagongPilipinas); try { localStorage.setItem('silago_bagong_pilipinas_logo_url', cloudBagongPilipinas); } catch {} }
        if (cloudPortalBanner) { setPortalBannerUrlState(cloudPortalBanner); try { localStorage.setItem('silago_portal_banner_url', cloudPortalBanner); } catch {} }
        if (cloudAdminProfile) setAdminProfile(cloudAdminProfile);
        if (cloudOfficeContact) setOfficeContactInfoState(cloudOfficeContact);
        if (Array.isArray(cloudVarieties) && cloudVarieties.length > 0) setVarieties(mergeRequiredRiceVarieties(cloudVarieties));
        if (Array.isArray(cloudEcosystems) && cloudEcosystems.length > 0) setEcosystems(cloudEcosystems);
        if (Array.isArray(cloudTenures) && cloudTenures.length > 0) setTenures(cloudTenures);
        if (Array.isArray(cloudSeasons) && cloudSeasons.length > 0) setSeasons([...new Set([ACTIVE_SEASON, ...getSeasonOptions(cloudSeasons)])]);
        if (Array.isArray(cloudIAs) && cloudIAs.length > 0) setIrrigationAssociations(cloudIAs);
        if (cloudSlsuPhoto) setSlsuPhotoUrlState(cloudSlsuPhoto);
        if (cloudSlsuLayout) setSlsuLayoutModeState(cloudSlsuLayout);
        if (cloudSlsuCaption) setSlsuCaptionState(cloudSlsuCaption);
        if (cloudSlsuSeal) setSlsuSealLogoUrlState(cloudSlsuSeal);
        if (cloudSlsuTitle) setSlsuCenterTitleState(cloudSlsuTitle);
        if (cloudSlsuSubtitle) setSlsuCenterSubtitleState(cloudSlsuSubtitle);
        if (cloudSlsuBadge) setSlsuBadgeTagState(cloudSlsuBadge);
        if (cloudSlsuTags) setSlsuTopTagsState(cloudSlsuTags);
        if (cloudMunicipalBranding) {
          setMunicipalBrandingState((prev) => ({ ...prev, ...cloudMunicipalBranding }));
          try { localStorage.setItem('silago_municipal_branding', JSON.stringify(cloudMunicipalBranding)); } catch {}
          if (cloudMunicipalBranding.silagoSealUrl) setSilagoLogoUrlState(cloudMunicipalBranding.silagoSealUrl);
          if (cloudMunicipalBranding.bagOngSilagoLogoUrl) setBagOngSilagoLogoUrlState(cloudMunicipalBranding.bagOngSilagoLogoUrl);
          if (cloudMunicipalBranding.daLogoUrl) setDaLogoUrlState(cloudMunicipalBranding.daLogoUrl);
        }
        if (cloudLandingPageConfig) {
          const mergedLanding: LandingPageConfig = {
            ...DEFAULT_LANDING_PAGE_CONFIG,
            ...cloudLandingPageConfig,
            mandateCards: Array.isArray(cloudLandingPageConfig.mandateCards) && cloudLandingPageConfig.mandateCards.length > 0
              ? cloudLandingPageConfig.mandateCards
              : DEFAULT_LANDING_PAGE_CONFIG.mandateCards
          };
          setLandingPageConfigState(mergedLanding);
          try { localStorage.setItem('silago_landing_page_config', JSON.stringify(mergedLanding)); } catch {}
        }
        if (Array.isArray(cloudLegalDecrees) && cloudLegalDecrees.length > 0) {
          const normalized = normalizeDecreeList(cloudLegalDecrees);
          setLegalDecreesState(normalized);
          try { localStorage.setItem('silago_legal_decrees', JSON.stringify(normalized)); } catch {}
        }
        if (Array.isArray(cloudSubsidyPrograms) && cloudSubsidyPrograms.length > 0) {
          setSubsidyProgramsState(cloudSubsidyPrograms);
          try { localStorage.setItem('silago_subsidy_programs', JSON.stringify(cloudSubsidyPrograms)); } catch {}
        }
        if (Array.isArray(cloudSubsidyClaims)) {
          setSubsidyClaimsState(cloudSubsidyClaims);
          try { localStorage.setItem('silago_subsidy_claims', JSON.stringify(cloudSubsidyClaims)); } catch {}
        }
        if (Array.isArray(cloudSubsidyHistory)) {
          setSubsidyHistoryState(cloudSubsidyHistory);
          try { localStorage.setItem('silago_subsidy_history', JSON.stringify(cloudSubsidyHistory)); } catch {}
        }
        if (cloudFormSchema && typeof cloudFormSchema === 'object' && Array.isArray(cloudFormSchema.sections) && Array.isArray(cloudFormSchema.fields)) {
          try {
            localStorage.setItem(FORM_SCHEMA_STORAGE_KEY, JSON.stringify(cloudFormSchema));
            window.dispatchEvent(new CustomEvent(FORM_SCHEMA_EVENT, { detail: cloudFormSchema }));
          } catch {}
        }
        if (cloudParcelCustomFields && typeof cloudParcelCustomFields === 'object') {
          try {
            localStorage.setItem(PARCEL_CUSTOM_FIELDS_KEY, JSON.stringify(cloudParcelCustomFields));
          } catch {}
        }
      } catch (err) {
        console.warn('Failed to load settings from cloud DB:', err);
      }
    };

    loadSettingsFromCloud();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        barangayProfiles,
        updateBarangayProfile,
        setCurrentUser,
        updateCurrentUserProfile,
        updateCurrentUserPassword,
        parcels,
        addParcel,
        updateParcel,
        deleteParcel,
        deleteBulkParcels,
        resetParcels,
        lftAccounts,
        addLftAccount,
        updateLftAccount,
        deleteLftAccount,
        resetLftAccounts,
        reorderLftAccounts,
        language,
        setLanguage,
        t,
        bgPhotoUrl,
        bgOpacity,
        bgBlur,
        bgActive,
        setBgPhotoUrl,
        setBgOpacity,
        setBgBlur,
        setBgActive,
        removeBgPhoto,
        backgroundHistory,
        addToBackgroundHistory,
        removeFromBackgroundHistory,
        clearBackgroundHistory,
        daLogoUrl,
        setDaLogoUrl,
        silagoLogoUrl,
        setSilagoLogoUrl,
        bagOngSilagoLogoUrl,
        setBagOngSilagoLogoUrl,
        southernLeyteLogoUrl,
        setSouthernLeyteLogoUrl,
        bagongPilipinasLogoUrl,
        setBagongPilipinasLogoUrl,
        portalBannerUrl,
        setPortalBannerUrl,
        systemLogos,
        updateSystemLogo,
        setSystemLogos,
        resetLogos,
        adminProfile,
        updateAdminProfile,
        slsuPhotoUrl,
        setSlsuPhotoUrl,
        slsuLayoutMode,
        setSlsuLayoutMode,
        slsuCaption,
        setSlsuCaption,
        slsuSealLogoUrl,
        setSlsuSealLogoUrl,
        slsuUniversityName,
        setSlsuUniversityName,
        slsuMotto,
        setSlsuMotto,
        slsuYear,
        setSlsuYear,
        slsuCenterTitle,
        setSlsuCenterTitle,
        slsuCenterSubtitle,
        setSlsuCenterSubtitle,
        slsuBadgeTag,
        setSlsuBadgeTag,
        slsuTopTags,
        setSlsuTopTags,
        settingsActiveSubTab,
        setSettingsActiveSubTab,
        resetSlsuDetails,
        resetAllDefaults,
        // Municipal Branding & System Identification Settings
        municipalBranding,
        updateMunicipalBranding,
        resetMunicipalBranding,
        // Office Hours & Hotline Settings
        officeContactInfo,
        updateOfficeContactInfo,
        resetOfficeContactInfo,
        // Landing Page Dynamic Configuration
        landingPageConfig,
        updateLandingPageConfig,
        resetLandingPageConfig,
        addMandateCard,
        updateMandateCard,
        deleteMandateCard,
        // Legal Decrees Registry
        legalDecrees,
        addLegalDecree,
        updateLegalDecree,
        deleteLegalDecree,
        resetLegalDecrees,
        // Government Subsidies & Owner Claim Tracking
        subsidyPrograms,
        subsidyClaims,
        subsidyHistory,
        addSubsidyProgram,
        updateSubsidyProgram,
        deleteSubsidyProgram,
        setOwnerSubsidyClaim,
        bulkMarkSubsidyClaims,
        addSubsidyHistoryEntry,
        deleteSubsidyHistoryEntry,
        // Manage Varieties (Add, Edit, Delete)
        varieties,
        addVariety,
        updateVariety,
        deleteVariety,
        // Manage Ecosystems (Add, Edit, Delete)
        ecosystems,
        addEcosystem,
        updateEcosystem,
        deleteEcosystem,
        // Manage Tenures (Add, Edit, Delete)
        tenures,
        addTenure,
        updateTenure,
        deleteTenure,
        // Manage Cropping Seasons (Add, Edit, Delete)
        seasons,
        addSeason,
        updateSeason,
        deleteSeason,
        // Manage Irrigation Associations (Add, Edit, Delete)
        irrigationAssociations,
        addIrrigationAssociation,
        updateIrrigationAssociation,
        deleteIrrigationAssociation,
        // Master-Detail Seasonal Production
        activeSeason,
        setActiveSeason,
        addSeasonalRecord,
        updateSeasonalRecord,
        deleteSeasonalRecord,
        // Supabase Realtime & RBAC State
        permissions,
        realtimeStatus,
        isRealtimeSyncing,
        syncWithSupabase,
        offlineQueueCount,
        isOnline,
        syncOfflineQueue,
        syncNotification,
        setSyncNotification,
        // Navigation Tab State
        activeTab,
        setActiveTab,
        // Farm Parcels Supabase Fetch & Mapping Methods
        fetchParcels,
        mapFarmerToParcel,
        // User Session & Auth Loading State
        isLoading: isAuthLoading || isParcelsLoading,
        isAuthLoading
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const useTranslation = () => {
  const { t, language, setLanguage } = useApp();
  return { t, language, setLanguage };
};
