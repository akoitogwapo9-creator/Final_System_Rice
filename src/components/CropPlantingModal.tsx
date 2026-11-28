import { farmerKey, farmLabel, parcelDescription } from '../data/officeRegistry';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getParcelSeasonOptions, getRecordedCropValue, getSeasonRecord, hasActualProduction, matchesSeasonFilter, normalizeSeasonalRecord, seasonOrder } from '../data/seasonalProduction';
import { FarmParcel, SeasonalProductionRecord } from '../types';
import { useApp } from '../context/AppContext';
import { isUserAuthorizedForBarangay } from '../data/barangays';
import { calculateCropGrowthStage, SEED_TYPE_LABELS } from '../data/riceVarieties';
import { useFarmerParcels } from '../hooks/useFarmerParcels';
import { FarmerCombobox } from './FarmerCombobox';
import { ManageReferenceModal, ManageType } from './ManageReferenceModal';
import {
  useRegistryFormSchema,
  getParcelCustomFields,
  saveParcelCustomFields
} from '../data/formSchema';
import {
  OfficeCustomFieldsGrid,
  OfficeFieldManageButton,
  OfficeModalHeader,
  OfficeSectionCard,
  OFFICE_INPUT_CLASS,
  OFFICE_LABEL_CLASS,
  OFFICE_SELECT_CLASS,
  mergeCustomFieldValues,
  validateRequiredCustomFields
} from './OfficeFormPrimitives';
import { Save, AlertTriangle, Loader2 } from 'lucide-react';

interface CropPlantingModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmerOnly?: boolean;
  initialParcel?: FarmParcel | null;
}

const EMPTY_CROP_DATA = {
  seedQuantityKg: '',
  breed: '',
  seedType: '',
  purpose: '',
  irrigationAssociation: '',
  sex: '',
  croppingSeason: '',
  plantingDate: '',
  targetYieldMt: ''
};

/**
 * Municipal Agriculture Office Crop Variety & Planting Schedule Form.
 * Shows the complete office-style crop entry form immediately on open with a
 * clean search + dropdown selector for choosing a registered farmer record.
 */
export const CropPlantingModal: React.FC<CropPlantingModalProps> = ({
  isOpen,
  onClose,
  farmerOnly = false,
  initialParcel = null
}) => {
  const {
    currentUser,
    parcels,
    updateParcel,
    varieties,
    ecosystems,
    tenures,
    seasons,
    irrigationAssociations
  } = useApp();

  const formSchema = useRegistryFormSchema();
  const [batch, setBatch] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { crop: typeof EMPTY_CROP_DATA; custom: Record<string, string> }>>({});
  const [selectedFarmer, setSelectedFarmer] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const unassignedRecordIds = useRef(new Map<string, string>());
  const [manageType, setManageType] = useState<ManageType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const sec3Label =
    formSchema.sections.find((s) => s.id === 'sec-crop')?.label ||
    '3. Variety, Irrigation & Tenure';
  const sec4Label =
    formSchema.sections.find((s) => s.id === 'sec-planting')?.label ||
    '4. Planting Date & Harvest';
  const customCropSections = formSchema.getCustomSections('crop');

  const [cropData, setCropData] = useState(EMPTY_CROP_DATA);

  const populateFromParcel = (parcel: FarmParcel) => {
    const draft = drafts[parcel.tagNumber];
    setCropData(draft?.crop || EMPTY_CROP_DATA);
    setCustomValues(draft?.custom || parcel.customFields || getParcelCustomFields(parcel.tagNumber));
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsSubmitting(false);
    setBatch(false);
    setDrafts({});
    unassignedRecordIds.current.clear();
    if (initialParcel) {
      setSelectedFarmer(farmerKey(initialParcel));
      setSelectedTag(farmerOnly ? '' : initialParcel.tagNumber);
      setCropData(EMPTY_CROP_DATA);
      setCustomValues(farmerOnly ? {} : initialParcel.customFields || getParcelCustomFields(initialParcel.tagNumber));
    } else {
      setSelectedFarmer('');
      setSelectedTag('');
      setCropData({ ...EMPTY_CROP_DATA });
      setCustomValues({});
    }
  }, [isOpen, initialParcel, farmerOnly]);

  const authorizedFarmers = useMemo(() => {
    return parcels.filter((p) => !p.isArchived && !p.is_archived && isUserAuthorizedForBarangay(currentUser, p.barangay));
  }, [parcels, currentUser]);

  const farmer = authorizedFarmers.find(parcel => farmerKey(parcel) === selectedFarmer);
  const { farms, loading, cached } = useFarmerParcels(farmer, authorizedFarmers, isOpen);
  const farmerFarms = farms.filter(parcel => isUserAuthorizedForBarangay(currentUser, parcel.barangay));
  const selectedParcel = farmerFarms.find(parcel => parcel.tagNumber === selectedTag);

  const selectParcel = (parcel: FarmParcel) => {
    if (selectedParcel?.tagNumber === parcel.tagNumber) return;
    if (batch && selectedParcel) {
      setDrafts(previous => ({ ...previous, [selectedParcel.tagNumber]: { crop: cropData, custom: customValues } }));
    }
    setSelectedTag(parcel.tagNumber);
    populateFromParcel(parcel);
    setError(null);
  };

  const handleSeasonChange = (season: string) => {
    const record = selectedParcel && season ? getSeasonRecord(selectedParcel, season) : undefined;
    const parcelSeason = selectedParcel?.croppingSeason || selectedParcel?.season || '';
    const isCurrent = record && (season ? matchesSeasonFilter(parcelSeason, season) : !parcelSeason);
    const target = record?.targetYieldMt === undefined && isCurrent ? selectedParcel.targetYieldMt : record?.targetYieldMt;
    setCropData((previous) => {
      if (!record) {
        const editingExisting = selectedParcel && previous.croppingSeason && getSeasonRecord(selectedParcel, previous.croppingSeason);
        return { ...(editingExisting ? EMPTY_CROP_DATA : previous), croppingSeason: season };
      }
      return {
        seedQuantityKg: record.seedQuantityKg == null ? '' : String(record.seedQuantityKg),
        croppingSeason: season,
        breed: getRecordedCropValue(record.seedVariety),
        seedType: getRecordedCropValue(record.seedType),
        purpose: record.ecosystem ?? (isCurrent ? selectedParcel.purpose : ''),
        irrigationAssociation: record.irrigationAssociation ?? (isCurrent ? selectedParcel.irrigationAssociation || '' : ''),
        sex: record.tenure ?? (isCurrent ? selectedParcel.sex : ''),
        plantingDate: record.plantingDate,
        targetYieldMt: target == null ? '' : String(target)
      };
    });
  };

  const phenology = useMemo(() => {
    return cropData.plantingDate && cropData.breed
      ? calculateCropGrowthStage(cropData.plantingDate, cropData.breed)
      : null;
  }, [cropData.plantingDate, cropData.breed]);

  const validateCrop = (crop: typeof EMPTY_CROP_DATA, custom: Record<string, string>) => {
    const requiredFields = [
      ['crop-season', 'Cropping Season', crop.croppingSeason],
      ['crop-variety', 'Rice / Palay Variety', crop.breed],
      ['crop-seed-type', 'Seed Type', crop.seedType],
      ['crop-ecosystem', 'Agro-Ecosystem / Water Source', crop.purpose],
      ['crop-ia', 'Irrigation Association (IA)', crop.irrigationAssociation],
      ['crop-tenure', 'Tenurial Status', crop.sex],
      ['crop-planting-date', 'Date of Planting / Sowing', crop.plantingDate],
      ['crop-target-yield', 'Target Yield (Metric Tons)', crop.targetYieldMt]
    ];
    for (const [id, label, value] of requiredFields) {
      if (formSchema.isVisible(id) && formSchema.isRequired(id) && !value) return `${formSchema.getLabel(id, label)} is required.`;
    }
    for (const value of [crop.seedQuantityKg, crop.targetYieldMt]) {
      if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) return 'Enter valid, non-negative quantities.';
    }
    return validateRequiredCustomFields(formSchema.getCustomFieldsForTarget('crop'), custom);
  };

  const saveCrop = async (selectedParcel: FarmParcel, cropData: typeof EMPTY_CROP_DATA, customValues: Record<string, string>) => {
    const phenology = cropData.plantingDate && cropData.breed
      ? calculateCropGrowthStage(cropData.plantingDate, cropData.breed) : null;
    const cropCustomFields = formSchema.getCustomFieldsForTarget('crop');
    const mergedCustomValues = mergeCustomFieldValues(cropCustomFields, customValues, {
      ...getParcelCustomFields(selectedParcel.tagNumber),
      ...(selectedParcel.customFields || {})
    });

    const targetYieldMt = cropData.targetYieldMt.trim() ? Number(cropData.targetYieldMt) : null;
    const latestParcel = selectedParcel;
    const existingRecord = cropData.croppingSeason ? getSeasonRecord(latestParcel, cropData.croppingSeason) : undefined;
    let recordId = existingRecord?.id;
    if (!recordId && !cropData.croppingSeason) {
      recordId = unassignedRecordIds.current.get(selectedParcel.tagNumber) || crypto.randomUUID();
      unassignedRecordIds.current.set(selectedParcel.tagNumber, recordId);
    }
    const seasonRecord = normalizeSeasonalRecord({
      ...existingRecord,
      id: recordId,
      season: cropData.croppingSeason,
      seedVariety: cropData.breed,
      seedQuantityKg: cropData.seedQuantityKg === '' ? undefined : Number(cropData.seedQuantityKg),
      seedType: cropData.seedType as SeasonalProductionRecord['seedType'],
      plantingDate: cropData.plantingDate,
      estimatedHarvestDate: phenology?.estimatedHarvestDate || '',
      harvestDate: existingRecord?.actualHarvestDate || phenology?.estimatedHarvestDate || '',
      productionStatus: existingRecord && hasActualProduction(existingRecord)
        ? existingRecord.productionStatus
        : cropData.plantingDate ? 'Standing Crop' : 'Not recorded',
      growthStage: phenology?.stage,
      elapsedDas: phenology?.dap,
      maturityPercentage: phenology?.percentageMaturity,
      ecosystem: cropData.purpose,
      tenure: cropData.sex,
      irrigationAssociation: cropData.irrigationAssociation,
      targetYieldMt,
      lftOfficerName: existingRecord?.lftOfficerName || currentUser?.name || ''
    }, selectedParcel.tagNumber);
    const seasonalRecords = [
      seasonRecord,
      ...(latestParcel.seasonalRecords || []).filter((record) =>
        record.id !== seasonRecord.id)
    ].sort((a, b) => seasonOrder(b.season) - seasonOrder(a.season));
    const currentParcelSeason = latestParcel.croppingSeason || latestParcel.season || '';
    const updatesLatestCrop = seasonalRecords[0]?.id === seasonRecord.id &&
      seasonOrder(seasonRecord.season) >= seasonOrder(currentParcelSeason);
    const updatedParcel: Partial<FarmParcel> = {
      seasonalRecords,
      ...updatesLatestCrop && {
        breed: cropData.breed,
        variety: cropData.breed,
        seedType: cropData.seedType,
        croppingSeason: seasonRecord.season,
        season: seasonRecord.season,
        plantingDate: cropData.plantingDate,
        targetYieldMt: targetYieldMt ?? undefined,
        harvestDate: seasonRecord.actualHarvestDate || phenology?.estimatedHarvestDate || '',
        healthStatus: seasonRecord.productionStatus === 'Harvest Completed' ? 'Harvested' : phenology?.stage || 'Not recorded',
        standingCropStage: phenology?.stage || '',
        ageMonths: phenology?.dap || 0,
        irrigationAssociation: cropData.irrigationAssociation,
        sex: cropData.sex,
        tenure: cropData.sex
      },
      customFields: mergedCustomValues
    };

    await updateParcel(selectedParcel.tagNumber, updatedParcel, selectedParcel);
    saveParcelCustomFields(selectedParcel.tagNumber, mergedCustomValues);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedParcel || isSubmitting) return;
    const activeTag = selectedParcel.tagNumber;
    const pending = { ...(batch ? drafts : {}), [activeTag]: { crop: cropData, custom: customValues } };
    const jobs: Array<{ parcel: FarmParcel; crop: typeof EMPTY_CROP_DATA; custom: Record<string, string> }> = [];
    for (const [tag, draft] of Object.entries(pending)) {
      const parcel = farmerFarms.find(farm => farm.tagNumber === tag);
      if (!parcel) {
        setError('A selected parcel is no longer available. Choose the farmer and parcels again.');
        return;
      }
      const issue = validateCrop(draft.crop, draft.custom);
      if (issue) {
        selectParcel(parcel);
        setError(`${farmLabel(parcel)}: ${issue}`);
        return;
      }
      jobs.push({ parcel, ...draft });
    }
    setIsSubmitting(true);
    setError(null);
    let saved = 0;
    try {
      for (const { parcel, crop, custom } of jobs) {
        await saveCrop(parcel, crop, custom);
        delete pending[parcel.tagNumber];
        unassignedRecordIds.current.delete(parcel.tagNumber);
        saved++;
      }
      onClose();
    } catch (error) {
      const failed = jobs[saved].parcel;
      setSelectedTag(failed.tagNumber);
      setCropData(pending[failed.tagNumber].crop);
      setCustomValues(pending[failed.tagNumber].custom);
      setDrafts(pending);
      setError(`${saved ? `${saved} saved. ` : ''}${farmLabel(failed)}: ${error?.message || 'Unable to save the crop record.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="bg-white border border-slate-300 rounded-lg w-full max-w-3xl shadow-xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
          <OfficeModalHeader
            title="Crop & Planting Record Form"
            subtitle="Municipal Agriculture Office • Rice Variety, Irrigation & Planting Schedule"
            onClose={() => { if (!isSubmitting) onClose(); }}
          />

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 bg-slate-100/70">
              {error && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-md flex items-center gap-2 text-xs text-red-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <fieldset disabled={isSubmitting} className="space-y-4">
              <OfficeSectionCard title="Registered Farmer">
                <FarmerCombobox parcels={authorizedFarmers} value={selectedFarmer} onChange={key => {
                  if (key === selectedFarmer) return;
                  setSelectedFarmer(key);
                  setSelectedTag('');
                  setCropData(EMPTY_CROP_DATA);
                  setCustomValues({});
                  setDrafts({});
                  setBatch(false);
                  setError(null);
                }} />
                {loading && <p role="status" className="text-xs text-slate-600">Loading registered parcels…</p>}
                {cached && <p role="status" className="text-xs text-amber-800">Live parcel lookup unavailable. Showing known parcels.</p>}
                {selectedFarmer && !loading && farmerFarms.length === 0 && <p>No available farm parcels.</p>}
                {farmerFarms.length > 1 && <label className="flex items-center gap-2 text-xs font-semibold">
                  <input type="checkbox" checked={batch} onChange={event => {
                    setBatch(event.target.checked);
                    if (!event.target.checked) setDrafts({});
                  }} /> Record crops for multiple parcels
                </label>}
                {batch ? (
                  <div className="grid gap-2 sm:grid-cols-2" aria-label="Farm parcel drafts">
                    {farmerFarms.map(parcel => {
                      const active = parcel.tagNumber === selectedParcel?.tagNumber;
                      const draft = active ? cropData : drafts[parcel.tagNumber]?.crop;
                      return <button key={parcel.tagNumber} type="button" aria-pressed={active}
                        className={`rounded border p-2 text-left text-xs ${active ? 'border-emerald-700 bg-emerald-50' : 'border-slate-300'}`}
                        onClick={() => selectParcel(parcel)}>
                        <span className="block font-semibold">{parcelDescription(parcel)}</span>
                        <span>{draft ? [draft.breed || 'Draft', draft.seedQuantityKg && `${draft.seedQuantityKg} kg`].filter(Boolean).join(' · ') : 'Add crop details'}</span>
                      </button>;
                    })}
                  </div>
                ) : <label className="block space-y-1">
                  <span className={OFFICE_LABEL_CLASS}>Select Farm</span>
                  <select className={OFFICE_SELECT_CLASS} required disabled={!selectedFarmer}
                    value={selectedParcel?.tagNumber || ''} onChange={event => {
                      const parcel = farmerFarms.find(farm => farm.tagNumber === event.target.value);
                      if (parcel) selectParcel(parcel);
                      else setSelectedTag('');
                    }}>
                    <option value="">Choose a farm parcel</option>
                    {farmerFarms.map(parcel => <option key={parcel.tagNumber} value={parcel.tagNumber}>{parcelDescription(parcel)}</option>)}
                  </select>
                </label>}

                {selectedParcel && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-[11px]">
                    <div className="min-w-0">
                      <span className="text-slate-500 block">Farmer Name</span>
                      <span className="font-bold text-slate-900 truncate block">
                        {selectedParcel.raiserName}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-500 block">RSBSA No.</span>
                      <span className="font-mono font-semibold text-slate-800 truncate block">
                        {selectedParcel.swineNameOrId || 'NO RSBSA'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-500 block">Barangay</span>
                      <span className="font-semibold text-slate-800 truncate block">
                        {selectedParcel.barangay}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Farm Area</span>
                      <span className="font-semibold text-slate-800">
                        {Number(selectedParcel.weightKg || selectedParcel.areaHa || 0).toFixed(2)} ha
                      </span>
                    </div>
                  </div>
                )}
              </OfficeSectionCard>

              {/* Section 3: Variety, Irrigation & Tenurial Details */}
              <OfficeSectionCard title={sec3Label}>
                <div className="max-w-lg">
                  {formSchema.isVisible('crop-season') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-season') }} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className={OFFICE_LABEL_CLASS}>
                          {formSchema.getLabel('crop-season', 'Cropping Season')}{' '}
                          {formSchema.isRequired('crop-season') && (
                            <span className="text-red-600">*</span>
                          )}
                        </label>
                        <OfficeFieldManageButton onClick={() => setManageType('season')} />
                      </div>
                      <select
                        aria-label={formSchema.getLabel('crop-season', 'Cropping Season')}
                        required={formSchema.isRequired('crop-season')}
                        value={cropData.croppingSeason}
                        onChange={(e) => handleSeasonChange(e.target.value)}
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        {getParcelSeasonOptions(selectedParcel ? [selectedParcel] : [], seasons).map((seas) => (
                          <option key={seas} value={seas}>
                            {seas}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {formSchema.isVisible('crop-variety') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-variety') }} className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between gap-2">
                        <label className={OFFICE_LABEL_CLASS}>
                          {formSchema.getLabel('crop-variety', 'Rice / Palay Variety')}{' '}
                          {formSchema.isRequired('crop-variety') && (
                            <span className="text-red-600">*</span>
                          )}
                        </label>
                        <OfficeFieldManageButton
                          label="Manage"
                          onClick={() => setManageType('variety')}
                        />
                      </div>
                      <select
                        aria-label={formSchema.getLabel('crop-variety', 'Rice / Palay Variety')}
                        required={formSchema.isRequired('crop-variety')}
                        value={cropData.breed}
                        onChange={(e) => setCropData({ ...cropData, breed: e.target.value })}
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        {cropData.breed && !varieties.some((variety) => variety.name === cropData.breed) && <option>{cropData.breed}</option>}
                        {varieties.map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name} ({SEED_TYPE_LABELS[v.seedType]})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formSchema.isVisible('crop-seed-type') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-seed-type') }} className="space-y-1">
                      <label className={OFFICE_LABEL_CLASS}>
                        {formSchema.getLabel('crop-seed-type', 'Seed Type')}{' '}
                        {formSchema.isRequired('crop-seed-type') && (
                          <span className="text-red-600">*</span>
                        )}
                      </label>
                      <select
                        required={formSchema.isRequired('crop-seed-type')}
                        value={cropData.seedType}
                        onChange={(e) => setCropData({ ...cropData, seedType: e.target.value })}
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        <option value="INBRED">Inbred (RCEF)</option>
                        <option value="HYBRID">Hybrid</option>
                        <option value="UNKNOWN">UNKNOWN / Farmer Saved</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {formSchema.isVisible('crop-ecosystem') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-ecosystem') }} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className={OFFICE_LABEL_CLASS}>
                          {formSchema.getLabel('crop-ecosystem', 'Agro-Ecosystem / Water Source')}{' '}
                          {formSchema.isRequired('crop-ecosystem') && (
                            <span className="text-red-600">*</span>
                          )}
                        </label>
                        <OfficeFieldManageButton onClick={() => setManageType('ecosystem')} />
                      </div>
                      <select
                        required={formSchema.isRequired('crop-ecosystem')}
                        value={cropData.purpose}
                        onChange={(e) => setCropData({ ...cropData, purpose: e.target.value })}
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        {ecosystems.map((eco) => (
                          <option key={eco} value={eco}>
                            {eco}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formSchema.isVisible('crop-ia') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-ia') }} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className={OFFICE_LABEL_CLASS}>
                          {formSchema.getLabel('crop-ia', 'Irrigation Association (IA)')}{' '}
                          {formSchema.isRequired('crop-ia') && (
                            <span className="text-red-600">*</span>
                          )}
                        </label>
                        <OfficeFieldManageButton
                          onClick={() => setManageType('irrigationAssociation')}
                        />
                      </div>
                      <select
                        required={formSchema.isRequired('crop-ia')}
                        value={cropData.irrigationAssociation}
                        onChange={(e) =>
                          setCropData({ ...cropData, irrigationAssociation: e.target.value })
                        }
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        {irrigationAssociations.map((ia) => (
                          <option key={ia} value={ia}>
                            {ia}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formSchema.isVisible('crop-tenure') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-tenure') }} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className={OFFICE_LABEL_CLASS}>
                          {formSchema.getLabel('crop-tenure', 'Tenurial Status')}{' '}
                          {formSchema.isRequired('crop-tenure') && (
                            <span className="text-red-600">*</span>
                          )}
                        </label>
                        <OfficeFieldManageButton onClick={() => setManageType('tenure')} />
                      </div>
                      <select
                        required={formSchema.isRequired('crop-tenure')}
                        value={cropData.sex}
                        onChange={(e) => setCropData({ ...cropData, sex: e.target.value })}
                        className={OFFICE_SELECT_CLASS}
                      >
                        <option value="">-- Select / N/A --</option>
                        {tenures.map((ten) => (
                          <option key={ten} value={ten}>
                            {ten}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}


                </div>

                <OfficeCustomFieldsGrid
                  fields={formSchema.getCustomFieldsForSection(sec3Label)}
                  values={customValues}
                  onChange={(fieldId, value) =>
                    setCustomValues((prev) => ({ ...prev, [fieldId]: value }))
                  }
                />
              </OfficeSectionCard>

              {selectedParcel && <label className="block">
                <span className={OFFICE_LABEL_CLASS}>Seed quantity (kg)</span>
                <input type="number" min="0" step="any" value={cropData.seedQuantityKg} className={OFFICE_INPUT_CLASS}
                  onChange={event => setCropData({ ...cropData, seedQuantityKg: event.target.value })} />
              </label>}

              {/* Section 4: Planting Schedule & Automated Phenology Summary */}
              <OfficeSectionCard title={sec4Label}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {formSchema.isVisible('crop-planting-date') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-planting-date') }} className="space-y-1">
                      <label className={OFFICE_LABEL_CLASS}>
                        {formSchema.getLabel('crop-planting-date', 'Date of Planting / Sowing')}{' '}
                        {formSchema.isRequired('crop-planting-date') && (
                          <span className="text-red-600">*</span>
                        )}
                      </label>
                      <input
                        type="date"
                        aria-label={formSchema.getLabel('crop-planting-date', 'Date of Planting / Sowing')}
                        required={formSchema.isRequired('crop-planting-date')}
                        value={cropData.plantingDate}
                        onChange={(e) => setCropData({ ...cropData, plantingDate: e.target.value })}
                        className={`${OFFICE_INPUT_CLASS} font-medium`}
                      />
                    </div>
                  )}

                  {formSchema.isVisible('crop-target-yield') && (
                    <div style={{ order: formSchema.getFieldOrder('crop-target-yield') }} className="space-y-1">
                      <label className={OFFICE_LABEL_CLASS}>
                        {formSchema.getLabel('crop-target-yield', 'Target Yield (Metric Tons)')}{' '}
                        {formSchema.isRequired('crop-target-yield') && (
                          <span className="text-red-600">*</span>
                        )}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        required={formSchema.isRequired('crop-target-yield')}
                        placeholder="N/A"
                        value={cropData.targetYieldMt}
                        onChange={(e) =>
                          setCropData({ ...cropData, targetYieldMt: e.target.value })
                        }
                        className={`${OFFICE_INPUT_CLASS} font-medium`}
                      />
                    </div>
                  )}
                </div>

                {formSchema.isVisible('crop-phenology') && phenology && (
                  <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">Crop Stage</span>
                        <span className="font-bold text-slate-900">{phenology.stage}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Days After Sowing</span>
                        <span className="font-bold text-slate-900">
                          {phenology.dap} DAS ({phenology.percentageMaturity}%)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Growth Phase</span>
                        <span className="font-semibold text-slate-800">{phenology.phase}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Est. Harvest Date</span>
                        <span className="font-bold text-emerald-800">
                          {phenology.estimatedHarvestDate} ({phenology.maturityDays} days)
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-700 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${phenology.percentageMaturity}%` }}
                      />
                    </div>

                    <p className="text-[11px] text-slate-600">{phenology.description}</p>
                  </div>
                )}

                <OfficeCustomFieldsGrid
                  fields={formSchema.getCustomFieldsForSection(sec4Label)}
                  values={customValues}
                  onChange={(fieldId, value) =>
                    setCustomValues((prev) => ({ ...prev, [fieldId]: value }))
                  }
                />
              </OfficeSectionCard>

              {customCropSections.map((sec) => {
                const secFields = formSchema.getCustomFieldsForSection(sec.label);
                if (secFields.length === 0) return null;
                return (
                  <OfficeSectionCard key={sec.id} title={sec.label}>
                    <OfficeCustomFieldsGrid
                      fields={secFields}
                      values={customValues}
                      onChange={(fieldId, value) =>
                        setCustomValues((prev) => ({ ...prev, [fieldId]: value }))
                      }
                    />
                  </OfficeSectionCard>
                );
              })}
              </fieldset>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-3 flex-wrap shrink-0">
              <span className="text-[11px] font-medium text-slate-600">
                {selectedParcel
                  ? `${selectedParcel.raiserName} · ${farmLabel(selectedParcel)}`
                  : 'Select a registered farmer to enable saving'}
              </span>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-md text-xs font-semibold border border-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!selectedParcel || isSubmitting}
                  className={`px-4 py-2 rounded-md text-xs font-semibold transition flex items-center gap-2 ${
                    !selectedParcel || isSubmitting
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-800 hover:bg-emerald-900 text-white cursor-pointer'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>{batch ? `Save ${new Set([...Object.keys(drafts), selectedParcel?.tagNumber].filter(Boolean)).size} crop records` : 'Save Crop & Planting Record'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {manageType && (
        <ManageReferenceModal
          isOpen={!!manageType}
          onClose={() => setManageType(null)}
          type={manageType}
          onSelect={(val) => {
            if (manageType === 'variety') setCropData((p) => ({ ...p, breed: val }));
            else if (manageType === 'ecosystem') setCropData((p) => ({ ...p, purpose: val }));
            else if (manageType === 'tenure') setCropData((p) => ({ ...p, sex: val }));
            else if (manageType === 'season') handleSeasonChange(val);
            else if (manageType === 'irrigationAssociation')
              setCropData((p) => ({ ...p, irrigationAssociation: val }));
          }}
        />
      )}
    </>
  );
};
