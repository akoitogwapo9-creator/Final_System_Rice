import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  BARANGAY_CLASSIFICATIONS, BARANGAY_TERRAINS, OFFICIAL_15_BARANGAYS, PublicBarangaySector,
  getBarangayLabel, getBarangayPublicSector, getBarangayZone, getPublicSectorLabel
} from '../data/barangays';
import { Barangay } from '../types';

interface EditBarangayDialogProps {
  barangay: Barangay;
  onClose: () => void;
  onSave: (updates: Partial<Barangay>, synced: boolean) => void;
}

const inputClass = 'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900';

export function EditBarangayDialog({ barangay, onClose, onSave }: EditBarangayDialogProps) {
  const { barangayProfiles, landingPageConfig, permissions, updateBarangayProfile } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(() => getBarangayLabel(barangay.name, barangayProfiles));
  const [zone, setZone] = useState(() => getBarangayZone(barangay.name, barangayProfiles));
  const [sector, setSector] = useState(() => getBarangayPublicSector(barangay.name, barangayProfiles));
  const [terrain, setTerrain] = useState(barangay.terrain || '');
  const [focalPerson, setFocalPerson] = useState(barangay.focalPerson || '');
  const [contact, setContact] = useState(barangay.contactNumber || '');
  const [puroks, setPuroks] = useState(String(barangay.puroks ?? 0));
  const [latitude, setLatitude] = useState(String(barangay.lat));
  const [longitude, setLongitude] = useState(String(barangay.lng));
  const [area, setArea] = useState(String(barangay.totalAreaHa ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { dialog.current?.showModal(); }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = name.trim();
    if (!permissions.isCentralAdmin || saving) return;
    if (!displayName || !zone.trim() || !terrain.trim()) {
      setError('Enter the barangay name, primary zone, and terrain.');
      return;
    }
    if (OFFICIAL_15_BARANGAYS.some((item) => item !== barangay.name
      && getBarangayLabel(item, barangayProfiles).toLowerCase() === displayName.toLowerCase())) {
      setError('That barangay name is already in use.');
      return;
    }

    setSaving(true);
    setError('');
    const details = {
      terrain: terrain.trim(), focalPerson: focalPerson.trim(), contactNumber: contact.trim(),
      puroks: Number(puroks), lat: Number(latitude), lng: Number(longitude), totalAreaHa: Number(area)
    };
    try {
      const synced = await updateBarangayProfile(barangay.name, {
        displayName, classification: zone.trim(), publicSector: sector,
        details: { ...barangayProfiles[barangay.name]?.details, ...details }
      });
      onSave(details, synced);
    } catch {
      setError('Unable to save this barangay. Please try again.');
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog} aria-labelledby="edit-barangay-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-xl border border-blue-100 bg-white text-slate-900 shadow-xl backdrop:bg-slate-950/45">
      <form onSubmit={save}>
        <header className="sticky top-0 z-10 border-b border-blue-100 bg-white px-5 py-4">
          <h2 id="edit-barangay-title" className="text-lg font-bold text-blue-950">Edit Barangay</h2>
        </header>
        <fieldset disabled={saving} className="grid gap-4 p-5 text-sm font-semibold sm:grid-cols-2">
          <label>Barangay Name<input autoFocus required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>
          <label>Primary Zone<input required maxLength={60} list="edit-barangay-zones" value={zone} onChange={(event) => setZone(event.target.value)} className={inputClass} />
            <datalist id="edit-barangay-zones">{BARANGAY_CLASSIFICATIONS.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <label>Terrain / Agro-Zone<input required list="edit-barangay-terrains" value={terrain} onChange={(event) => setTerrain(event.target.value)} className={inputClass} />
            <datalist id="edit-barangay-terrains">{BARANGAY_TERRAINS.map((item) => <option key={item} value={item} />)}</datalist>
          </label>
          <label>Public Sector Group<select value={sector} onChange={(event) => setSector(event.target.value as PublicBarangaySector)} className={inputClass}>
            <option value="coastal">{getPublicSectorLabel('coastal', landingPageConfig)}</option>
            <option value="inland">{getPublicSectorLabel('inland', landingPageConfig)}</option>
          </select></label>
          <label>Extension Focal Person<input value={focalPerson} onChange={(event) => setFocalPerson(event.target.value)} className={inputClass} /></label>
          <label>Contact Number<input type="tel" value={contact} onChange={(event) => setContact(event.target.value)} className={inputClass} /></label>
          <label>Latitude<input required type="number" min={-90} max={90} step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className={inputClass} /></label>
          <label>Longitude<input required type="number" min={-180} max={180} step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className={inputClass} /></label>
          <label>Measured Area (ha)<input required type="number" min={0} step="any" value={area} onChange={(event) => setArea(event.target.value)} className={inputClass} /></label>
          <label>Purok Count<input required type="number" min={0} step={1} value={puroks} onChange={(event) => setPuroks(event.target.value)} className={inputClass} /></label>
          {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
        </fieldset>
        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-blue-100 bg-white px-5 py-3">
          <button type="button" disabled={saving} onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Changes'}</button>
        </footer>
      </form>
    </dialog>
  );
}
