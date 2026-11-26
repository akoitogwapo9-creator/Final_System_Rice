import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { FarmParcel, SeasonalProductionRecord } from '../types';
import { canUserRecordSeasonalProduction } from '../utils/rbac';
import { getFarmerPhoto } from '../data/photos';
import { calculateCropGrowthStage } from '../data/riceVarieties';
import { getRecordedCropValue, hasActualProduction } from '../data/seasonalProduction';
import { SafeImage } from './SafeImage';
import {
  X,
  MapPin,
  User,
  ShieldCheck,
  Printer,
  Edit2,
  AlertTriangle,
  PlusCircle
} from 'lucide-react';
import { DaLogo, SilagoSeal, BagOngSilagoLogo, OfficialSealsTrio } from './Seals';
import { SeasonalProductionModal } from './SeasonalProductionModal';
import { getParcelCustomFields, useRegistryFormSchema } from '../data/formSchema';

export type ParcelModalTab = 'profile' | 'certificate';

interface ParcelDetailModalProps {
  parcel: FarmParcel | null;
  initialTab?: ParcelModalTab;
  onClose: () => void;
  onEdit?: (parcel: FarmParcel) => void;
  onDelete?: (tagNumber: string) => void;
}

export const ParcelDetailModal: React.FC<ParcelDetailModalProps> = ({
  parcel: initialParcel,
  initialTab = 'profile',
  onClose,
  onEdit,
  onDelete
}) => {
  const [activeTab, setActiveTab] = useState<ParcelModalTab>(initialTab);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seasonalModalOpen, setSeasonalModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SeasonalProductionRecord | null>(null);
  const { parcels, permissions, currentUser } = useApp();
  const parcel = parcels.find((item) => item.tagNumber === initialParcel?.tagNumber) || initialParcel;
  const formSchema = useRegistryFormSchema();

  if (!parcel) return null;
  const canRecordHarvest = canUserRecordSeasonalProduction(currentUser, parcel.barangay);

  const customFieldEntries = Object.entries({
    ...getParcelCustomFields(parcel.tagNumber),
    ...(parcel.customFields || {})
  })
    .filter(([, val]) => String(val ?? '').trim() !== '')
    .map(([id, val]) => ({
      id,
      label: formSchema.getLabel(id, id),
      value: String(val)
    }));

  const farmerPhoto = getFarmerPhoto(parcel);

  // Safe field extractions with comprehensive fallbacks
  const seasonalRecords = Array.isArray(parcel?.seasonalRecords) ? parcel.seasonalRecords : [];
  const areaHa = Number(parcel.weightKg ?? parcel.areaHa ?? parcel.farm_area_ha ?? 0);
  const latVal = typeof parcel?.lat === 'number' && !isNaN(parcel.lat) ? parcel.lat : (parcel as any)?.coordinates?.lat ?? 10.53;
  const lngVal = typeof parcel?.lng === 'number' && !isNaN(parcel.lng) ? parcel.lng : (parcel as any)?.coordinates?.lng ?? 125.16;

  const formatCoords = (num?: number, fallback = 0) => {
    const val = typeof num === 'number' && !isNaN(num) ? num : fallback;
    return val.toFixed(5);
  };

  const cropStage = parcel.plantingDate && parcel.breed
    ? calculateCropGrowthStage(parcel.plantingDate, parcel.breed)
    : null;
  const profileDetails = [
    ['Registration Parcel ID', parcel.tagNumber],
    ['RSBSA Reference', parcel.swineNameOrId],
    ['Date of Birth', parcel.birthday],
    ['Contact Number', parcel.contactNumber],
    ['Farm Barangay', parcel.barangay],
    ['Purok / Sitio', parcel.purok],
    ['Farm Area', areaHa ? `${areaHa.toFixed(2)} ha` : ''],
    ['GPS Coordinates', `${formatCoords(latVal)}, ${formatCoords(lngVal)}`],
    ['Rice Variety', getRecordedCropValue(parcel.breed)],
    ['Seed Type', getRecordedCropValue(parcel.seedType)],
    ['Tenure', getRecordedCropValue(parcel.sex || parcel.tenure)],
    ['Agro-Ecosystem', getRecordedCropValue(parcel.purpose || parcel.ecosystem)],
    ['Irrigation Association', getRecordedCropValue(parcel.irrigationAssociation)],
    ['Cropping Season', getRecordedCropValue(parcel.croppingSeason || parcel.season)],
    ['Planting Date', parcel.plantingDate],
    ['Target Yield', parcel.targetYieldMt == null ? '' : `${parcel.targetYieldMt.toFixed(2)} MT`],
    ['RSBSA & Insurance', parcel.vaccinationStatus],
    ['Crop Stage', cropStage?.stage],
    ['Estimated Harvest Date', cropStage?.estimatedHarvestDate],
    ...customFieldEntries.map(({ label, value }) => [label, value])
  ];

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-gov-ink w-full max-w-xl h-full shadow-2xl border-l border-gov-line animate-in slide-in-from-right duration-250 flex flex-col"
      >
        {/* Drawer Top Bar */}
        <div className="bg-gov-forest text-white p-4 sm:p-5 relative shrink-0 border-b-2 border-gov-gold">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold bg-white/15 text-emerald-200 border border-white/20 px-2 py-0.5 rounded-sm">
                  {parcel.tagNumber}
                </span>
                <span className="text-[10px] font-mono text-white/85 bg-black/25 px-2 py-0.5 rounded-sm">
                  {parcel.swineNameOrId}
                </span>
                <span className="text-[10px] font-semibold text-amber-200">
                  {parcel.syncStatus}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-serif font-bold text-white mt-1.5 truncate">
                {parcel.raiserName}
              </h2>
              <p className="text-xs text-white/75 flex items-center gap-1.5 mt-0.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>{parcel.address}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              type="button"
              className="p-1 rounded text-white/65 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
              title="Close panel (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 sm:px-6 pt-2 bg-gov-forest-dark border-t border-white/10 overflow-x-auto text-xs shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-2 font-semibold rounded-t transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap text-xs ${
              activeTab === 'profile'
                ? 'bg-white text-gov-ink'
                : 'text-white/75 hover:text-white hover:bg-white/10'
            }`}
          >
            <User className="w-3.5 h-3.5 text-gov-green" />
            <span>Farmer Record</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('certificate')}
            className={`px-3.5 py-2 font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap text-xs ${
              activeTab === 'certificate'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
            <span>📜 Certificate</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Certificate View */}
          {activeTab === 'certificate' ? (
            <div id="printable-certificate-document" className="mx-auto max-w-4xl p-5 sm:p-8 bg-white border border-emerald-900/15 rounded-2xl space-y-5 text-center shadow-sm relative">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="absolute top-3 right-3 text-xs text-slate-500 hover:text-slate-800 underline font-sans cursor-pointer"
              >
                Back to Dossier
              </button>

              <OfficialSealsTrio className="justify-center" />

              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-sans font-bold">
                  MUNICIPALITY OF SILAGO • DEPARTMENT OF AGRICULTURE
                </p>
                <h3 className="text-lg font-serif font-bold text-[#0B2545] uppercase tracking-wide mt-0.5">
                  Official Certificate of Rice Parcel Georeferencing
                </h3>
                <p className="text-[11px] text-slate-500 italic">
                  Registry System for Basic Sectors in Agriculture (RSBSA) Validation
                </p>
              </div>

              <div className="border-t border-b border-amber-200/80 py-4 text-left text-xs space-y-2 font-sans">
                <p>
                  This certifies that the palay cultivation parcel designated under Tag ID{' '}
                  <strong className="font-mono text-emerald-800">{parcel.tagNumber}</strong>,
                  registered to farmer-tiller <strong className="text-slate-900">{parcel.raiserName}</strong>,
                  located at <strong>{parcel.address}</strong>, has been officially georeferenced and field-surveyed.
                </p>
                <div className="grid grid-cols-2 gap-2 bg-white/70 p-3 rounded-xl border border-amber-200">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Cultivated Rice Variety:</span>
                    <strong className="text-slate-800">{parcel.breed}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Surveyed Hectarage:</span>
                    <strong className="text-emerald-700">{parcel.weightKg} Hectares</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Tenurial Classification:</span>
                    <strong className="text-slate-800">{getRecordedCropValue(parcel.sex) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Agro-Ecosystem / NIA:</span>
                    <strong className="text-slate-800">{getRecordedCropValue(parcel.purpose) || 'N/A'}</strong>
                  </div>
                  {parcel.irrigationAssociation && (
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-500 block">Irrigation Association (IA):</span>
                      <strong className="text-teal-800">{parcel.irrigationAssociation}</strong>
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-slate-500 block">Survey Coordinates:</span>
                    <span className="font-mono text-[11px] text-slate-700">
                      {formatCoords(latVal)}, {formatCoords(lngVal)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Insurance Status:</span>
                    <strong className="text-blue-700">{parcel.vaccinationStatus}</strong>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-around pt-2 text-[11px]">
                <div className="text-center">
                  <div className="w-32 border-b border-slate-700 mx-auto mb-1"></div>
                  <strong className="block text-slate-800">Engr. Arnaldo M. Valdez</strong>
                  <span className="text-slate-500 text-[10px]">Municipal Agriculturist / MAO Silago</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Official Certificate
                </button>
              </div>
            </div>
          ) : (
            <article className="overflow-hidden rounded-lg border border-blue-200 bg-white">
              <header className="flex items-start gap-4 border-b border-blue-200 bg-blue-50 px-4 py-4 sm:px-5">
                <SafeImage src={farmerPhoto} alt={parcel.raiserName} fallbackType="farmer" className="h-16 w-16 rounded border border-blue-200 object-cover" containerClassName="shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-serif text-lg font-bold text-slate-900">{parcel.raiserName}</h3>
                  <p className="mt-1 text-xs text-slate-600">{parcel.residential_address || parcel.address || 'N/A'}</p>
                </div>
              </header>

              <section className="p-4 sm:p-5" aria-label="Farmer profile and land details">
                <h4 className="mb-3 text-sm font-semibold text-blue-950">Farmer Profile &amp; Land Details</h4>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {profileDetails.map(([label, value], index) => (
                    <div key={`${label}-${index}`} className="min-w-0 border-t border-slate-100 pt-2">
                      <dt className="text-[10px] font-semibold uppercase text-slate-600">{label}</dt>
                      <dd className="mt-0.5 break-words text-xs font-medium text-slate-900">{value || 'N/A'}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="border-t border-blue-200" aria-label="Seasonal harvest history">
                <header className="flex flex-wrap items-center justify-between gap-2 bg-blue-50 px-4 py-3 sm:px-5">
                  <h4 className="text-sm font-semibold text-blue-950">Seasonal Harvest History</h4>
                  {canRecordHarvest && (
                    <button type="button" onClick={() => {
                      setEditingRecord(null);
                      setSeasonalModalOpen(true);
                    }} className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800">
                      <PlusCircle className="h-3.5 w-3.5" />
                      Log Harvest
                    </button>
                  )}
                </header>

                {seasonalRecords.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-slate-600 sm:px-5">N/A · No planting or harvest records yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-y border-blue-100 bg-white text-[10px] font-semibold uppercase text-slate-600">
                        <tr>
                          <th scope="col" className="px-4 py-2">Season</th>
                          <th scope="col" className="px-4 py-2">Variety / Seed Type</th>
                          <th scope="col" className="px-4 py-2">Planting Date</th>
                          <th scope="col" className="px-4 py-2">Harvest Date</th>
                          <th scope="col" className="px-4 py-2 text-right">Production (MT)</th>
                          <th scope="col" className="px-4 py-2 text-right">Yield (MT/ha)</th>
                          <th scope="col" className="px-4 py-2 text-right">Gross Income</th>
                          <th scope="col" className="px-4 py-2">Status</th>
                          {canRecordHarvest && <th scope="col" className="px-4 py-2">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {seasonalRecords.map((record) => {
                          const actual = hasActualProduction(record);
                          return (
                            <tr key={record.id} className="hover:bg-blue-50/50">
                              <td className="px-4 py-2">{getRecordedCropValue(record.seasonName || record.season) || 'N/A'}</td>
                              <td className="px-4 py-2">
                                <div className="font-semibold">{getRecordedCropValue(record.seedVariety) || 'N/A'}</div>
                                <div className="text-[10px] text-slate-600">{getRecordedCropValue(record.seedType) || 'N/A'}</div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2">{record.plantingDate || 'N/A'}</td>
                              <td className="whitespace-nowrap px-4 py-2">{record.actualHarvestDate || (actual ? record.harvestDate : '') || 'N/A'}</td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {actual ? record.actualProductionVolumeMt.toFixed(2) : 'N/A'}
                                {actual && record.actualProductionBags != null && (
                                  <div className="whitespace-nowrap text-[10px] text-slate-600">{record.actualProductionBags} bags</div>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums">{actual ? record.yieldMtPerHa.toFixed(2) : 'N/A'}</td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {actual && record.grossIncome != null ? `₱${record.grossIncome.toLocaleString()}` : 'N/A'}
                              </td>
                              <td className="px-4 py-2">{getRecordedCropValue(record.productionStatus) || 'N/A'}</td>
                              {canRecordHarvest && (
                                <td className="px-4 py-2">
                                  <button type="button" onClick={() => {
                                    setEditingRecord(record);
                                    setSeasonalModalOpen(true);
                                  }} className="font-semibold text-blue-700 hover:underline">Edit</button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </article>
          )}
        </div>

        {/* Delete Confirmation Banner inside Modal */}
        {confirmDelete && (
          <div className="bg-rose-50 border-t border-b border-rose-200 p-4 shrink-0 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-rose-900">
                  Confirm Delete Farm Registration
                </h4>
                <p className="text-xs text-rose-700 mt-0.5">
                  Are you sure you want to permanently delete registration <strong>{parcel.tagNumber}</strong> for <strong>{parcel.raiserName}</strong>? This action cannot be undone.
                </p>
                <div className="flex items-center gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete?.(parcel.tagNumber);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs"
                  >
                    Yes, Delete Registration
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3.5 bg-gov-canvas/60 border-t border-gov-line flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {onEdit && permissions.canEditParcels && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(parcel);
                }}
                className="gov-btn gov-btn-secondary text-xs"
              >
                <Edit2 className="w-3.5 h-3.5 text-gov-green" />
                <span>Edit Registration</span>
              </button>
            )}
            {onDelete && !confirmDelete && permissions.canDeleteParcels && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-rose-700 hover:text-rose-900 hover:underline px-2 py-1 transition cursor-pointer"
                title="Delete this farm registration"
              >
                Delete Record
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="gov-btn gov-btn-secondary text-xs"
          >
            Close
          </button>
        </div>
      </div>

      {seasonalModalOpen && (
        <SeasonalProductionModal
          isOpen={seasonalModalOpen}
          onClose={() => {
            setSeasonalModalOpen(false);
            setEditingRecord(null);
          }}
          farmer={parcel}
          existingRecord={editingRecord}
        />
      )}
    </div>
  );
};

export const FarmerDossierModal = ParcelDetailModal;
