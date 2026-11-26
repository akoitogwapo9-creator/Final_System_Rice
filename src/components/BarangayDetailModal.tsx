import { useApp } from '../context/AppContext';
import { BARANGAY_CLASSIFICATIONS, getBarangayLabel, getBarangayZone, matchBarangay, OFFICIAL_15_BARANGAYS } from '../data/barangays';
import React, { useState, useEffect } from 'react';
import { Barangay, FarmParcel } from '../types';
import { X, MapPin, User, Phone, Wheat, Droplets, Compass, Layers, ChevronRight, Pencil, Save, RotateCcw, Check } from 'lucide-react';
import { getLandPhoto } from '../data/photos';

const TERRAIN_OPTIONS = [
  'Coastal Plains',
  'River Basin Irrigated',
  'Upland & River Basin',
  'Lowland Alluvial',
  'Upland Terrace',
  'Lowland Alluvial & Coast',
  'Lowland Alluvial & Coastal'
];

interface BarangayDetailModalProps {
  barangay: Barangay | null;
  parcels: FarmParcel[];
  onClose: () => void;
  onSelectParcel: (parcel: FarmParcel) => void;
  onViewOnMap?: (barangay: Barangay) => void;
  onUpdateBarangay?: (name: string, updates: Partial<Barangay>) => void;
  canEdit?: boolean;
}

export const BarangayDetailModal: React.FC<BarangayDetailModalProps> = ({
  barangay,
  parcels,
  onClose,
  onSelectParcel,
  onViewOnMap,
  onUpdateBarangay,
  canEdit = false
}) => {
  const { permissions, barangayProfiles, updateBarangayProfile } = useApp();
  const mayEdit = canEdit && permissions.isCentralAdmin;
  const [editing, setIsEditing] = useState(false);
  const isEditing = editing && mayEdit;
  const [draftName, setDraftName] = useState('');
  const [draftClassification, setDraftClassification] = useState('Coastal');
  const [saveNotice, setSaveNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Draft state for editable fields
  const [draftFocalPerson, setDraftFocalPerson] = useState('');
  const [draftContactNumber, setDraftContactNumber] = useState('');
  const [draftTerrain, setDraftTerrain] = useState('');
  const [draftPuroks, setDraftPuroks] = useState(0);
  const [draftTotalAreaHa, setDraftTotalAreaHa] = useState(0);
  const [draftIrrigatedAreaHa, setDraftIrrigatedAreaHa] = useState(0);
  const [draftRainfedAreaHa, setDraftRainfedAreaHa] = useState(0);
  const [draftLat, setDraftLat] = useState(0);
  const [draftLng, setDraftLng] = useState(0);

  // Populate drafts when barangay changes or edit mode is entered
  useEffect(() => {
    if (barangay) {
      resetDrafts(barangay);
    }
  }, [barangay, barangayProfiles]);

  const resetDrafts = (b: Barangay) => {
    setDraftName(getBarangayLabel(b.name, barangayProfiles));
    setDraftClassification(getBarangayZone(b.name, barangayProfiles));
    setDraftFocalPerson(b.focalPerson || '');
    setDraftContactNumber(b.contactNumber || '');
    setDraftTerrain(b.terrain || '');
    setDraftPuroks(b.puroks || 0);
    setDraftTotalAreaHa(b.totalAreaHa || 0);
    setDraftIrrigatedAreaHa(b.irrigatedAreaHa || 0);
    setDraftRainfedAreaHa(b.rainfedAreaHa || 0);
    setDraftLat(b.lat || 0);
    setDraftLng(b.lng || 0);
  };

  if (!barangay) return null;

  const brgyParcels = parcels.filter(
    (p) => matchBarangay(p.barangay, barangay.name)
  );

  const handleEnterEdit = () => {
    if (!mayEdit) return;
    resetDrafts(barangay);
    setIsEditing(true);
    setSaveNotice('');
  };

  const handleCancelEdit = () => {
    resetDrafts(barangay);
    setIsEditing(false);
    setSaveNotice('');
  };

  const handleSave = async () => {
    if (!mayEdit || saving || !draftName.trim() || !draftClassification.trim()) return;
    const displayName = draftName.trim();
    if (OFFICIAL_15_BARANGAYS.some((name) =>
      name !== barangay.name && getBarangayLabel(name, barangayProfiles).toLowerCase() === displayName.toLowerCase()
    )) {
      setSaveNotice('That barangay name is already in use.');
      return;
    }
    setSaving(true);
    const updates: Partial<Barangay> = {
      focalPerson: draftFocalPerson.trim(),
      contactNumber: draftContactNumber.trim(),
      terrain: draftTerrain,
      puroks: draftPuroks,
      totalAreaHa: draftTotalAreaHa,
      irrigatedAreaHa: draftIrrigatedAreaHa,
      rainfedAreaHa: draftRainfedAreaHa,
      lat: draftLat,
      lng: draftLng
    };

    if (onUpdateBarangay) {
      onUpdateBarangay(barangay.name, updates);
    }

    // Also persist to localStorage (same key used by BarangaysView / GIS Measure)
    try {
      const allSettings = JSON.parse(localStorage.getItem('silago_gis_measure_settings') || '{}');
      allSettings[barangay.name] = {
        ...allSettings[barangay.name],
        focalPerson: updates.focalPerson,
        contactNumber: updates.contactNumber,
        zone: updates.terrain,
        puroks: updates.puroks,
        areaHa: updates.totalAreaHa,
        irrigatedAreaHa: updates.irrigatedAreaHa,
        rainfedAreaHa: updates.rainfedAreaHa,
        centerLat: updates.lat,
        centerLng: updates.lng
      };
      localStorage.setItem('silago_gis_measure_settings', JSON.stringify(allSettings));
    } catch {
      // localStorage might be unavailable
    }

    const synced = await updateBarangayProfile(barangay.name, { displayName, classification: draftClassification });
    setSaving(false);
    setIsEditing(false);
    setSaveNotice(synced ? `Barangay ${displayName} details saved.` : 'Saved on this device. Supabase sync could not be confirmed.');
    setTimeout(() => setSaveNotice(''), 4000);
  };

  // Initials for the avatar
  const displayFocalPerson = isEditing ? draftFocalPerson : (barangay.focalPerson || '');
  const initials = displayFocalPerson
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');

  // The input style classes
  const inputClass =
    'w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition shadow-2xs';
  const selectClass =
    'w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition shadow-2xs cursor-pointer';
  const numberInputClass =
    'w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none transition shadow-2xs text-center';

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white text-slate-800 w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#0B1E38] text-white p-5 sm:p-6 relative shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold text-emerald-400 uppercase tracking-widest bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  {barangay.asfStatus}
                </span>
                <span className="text-xs text-slate-300">
                  Sector: {isEditing ? draftClassification : getBarangayZone(barangay.name, barangayProfiles)}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white mt-1">
                Barangay {getBarangayLabel(barangay.name, barangayProfiles)}
              </h2>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                Municipality of Silago, Southern Leyte • {isEditing ? draftPuroks : barangay.puroks} Designated Puroks / Sitios
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {mayEdit && !isEditing && (
                <button
                  onClick={handleEnterEdit}
                  type="button"
                  className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-500/20 transition cursor-pointer"
                  title="Edit Barangay Details"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                type="button"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Save Notice */}
        {saveNotice && (
          <div className="mx-5 mt-4 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-900 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">

          {/* LFT Officer Info Card */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                {initials || <User className="w-5 h-5" />}
              </div>
              {isEditing ? (
                <div className="space-y-2 flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Designated Local Farm Technician (LFT)
                  </span>
                  <input
                    type="text"
                    value={draftFocalPerson}
                    onChange={(e) => setDraftFocalPerson(e.target.value)}
                    placeholder="Focal Person Full Name"
                    className={inputClass}
                  />
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <input
                      type="text"
                      value={draftContactNumber}
                      onChange={(e) => setDraftContactNumber(e.target.value)}
                      placeholder="e.g. 0945-123-4567"
                      className={inputClass}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                    Designated Local Farm Technician (LFT)
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">{barangay.focalPerson || '—'}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-600 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      {barangay.contactNumber || '—'}
                    </span>
                    {barangay.username && (
                      <span className="font-mono text-[11px] text-slate-400">
                        @{barangay.username}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {onViewOnMap && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewOnMap(barangay);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              >
                <Compass className="w-4 h-4" />
                Focus on GIS Map
              </button>
            )}
          </div>

          {/* Terrain & Puroks (Editable) */}
          {isEditing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                <span>Barangay Name</span>
                <input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  className={inputClass}
                  maxLength={100}
                />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-700">
                <span>Barangay Classification / Zone</span>
                <input
                  list="barangay-classification-options"
                  value={draftClassification}
                  onChange={(event) => setDraftClassification(event.target.value)}
                  className={inputClass}
                  required
                  maxLength={60}
                />
                <datalist id="barangay-classification-options">
                  {BARANGAY_CLASSIFICATIONS.map((zone) => <option key={zone} value={zone} />)}
                </datalist>
              </label>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                  Agro-Ecosystem / Terrain Zone
                </label>
                <select
                  value={draftTerrain}
                  onChange={(e) => setDraftTerrain(e.target.value)}
                  className={selectClass}
                >
                  {TERRAIN_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                  Designated Puroks / Sitios
                </label>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={draftPuroks}
                  onChange={(e) => setDraftPuroks(parseInt(e.target.value) || 0)}
                  className={numberInputClass}
                />
              </div>
            </div>
          )}

          {/* Key Metrics Bento */}
          {isEditing ? (
            <div className="space-y-3">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Rice Area Breakdown (Hectares)
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 block text-center">Total Rice Area</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={draftTotalAreaHa}
                    onChange={(e) => setDraftTotalAreaHa(parseFloat(e.target.value) || 0)}
                    className={numberInputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-blue-600 block text-center">NIA Irrigated</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={draftIrrigatedAreaHa}
                    onChange={(e) => setDraftIrrigatedAreaHa(parseFloat(e.target.value) || 0)}
                    className={`${numberInputClass} border-blue-300 focus:ring-blue-500/30 focus:border-blue-500`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-amber-700 block text-center">Rainfed Sector</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={draftRainfedAreaHa}
                    onChange={(e) => setDraftRainfedAreaHa(parseFloat(e.target.value) || 0)}
                    className={`${numberInputClass} border-amber-300 focus:ring-amber-500/30 focus:border-amber-500`}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Rice Area</span>
                <strong className="text-lg font-serif font-black text-slate-900">
                  {barangay.totalAreaHa.toFixed(1)} ha
                </strong>
              </div>
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-center">
                <span className="text-[10px] uppercase font-bold text-blue-600 block">NIA Irrigated</span>
                <strong className="text-lg font-serif font-black text-blue-900">
                  {barangay.irrigatedAreaHa.toFixed(1)} ha
                </strong>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-center">
                <span className="text-[10px] uppercase font-bold text-amber-700 block">Rainfed Sector</span>
                <strong className="text-lg font-serif font-black text-amber-900">
                  {barangay.rainfedAreaHa.toFixed(1)} ha
                </strong>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-center">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block">Parcels Mapped</span>
                <strong className="text-lg font-serif font-black text-emerald-900">
                  {brgyParcels.length}
                </strong>
              </div>
            </div>
          )}

          {/* Coordinates & Terrain */}
          {isEditing ? (
            <div className="space-y-2">
              <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                Center Coordinates
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 block">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draftLat}
                    onChange={(e) => setDraftLat(parseFloat(e.target.value) || 0)}
                    className={numberInputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 block">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={draftLng}
                    onChange={(e) => setDraftLng(parseFloat(e.target.value) || 0)}
                    className={numberInputClass}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-mono text-slate-600">
                  Lat: {barangay.lat.toFixed(4)}, Lng: {barangay.lng.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-slate-700 font-semibold">{barangay.terrain}</span>
              </div>
            </div>
          )}

          {/* Registered Rice Parcels List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Wheat className="w-4 h-4 text-emerald-600" />
                Georeferenced Farm Parcels in Brgy. {getBarangayLabel(barangay.name, barangayProfiles)} ({brgyParcels.length})
              </h4>
            </div>

            {brgyParcels.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                No farm parcels registered yet for this barangay in the current demo season.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {brgyParcels.map((parcel) => (
                  <div
                    key={parcel.tagNumber}
                    onClick={() => {
                      onClose();
                      onSelectParcel(parcel);
                    }}
                    className="p-3 bg-white border border-slate-200 hover:border-emerald-500 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition group shadow-2xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={getLandPhoto(parcel)}
                        alt="Parcel"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 group-hover:text-emerald-700">
                            {parcel.tagNumber}
                          </span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            {parcel.weightKg} ha
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {parcel.raiserName} • <span className="text-emerald-700 font-semibold">{parcel.breed}</span>
                        </p>
                        <span className="text-[10px] text-slate-400 truncate block">
                          {parcel.purok} • {parcel.healthStatus}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !draftName.trim() || !draftClassification.trim()}
                  onClick={handleSave}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                Save Barangay
              </button>
            </>
          ) : (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
