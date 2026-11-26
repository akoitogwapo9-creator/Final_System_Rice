import { useEffect, useId, useRef } from 'react';
import L from 'leaflet';
import { X } from 'lucide-react';
import { getBarangayLabel, getBarangayZone, matchBarangay } from '../data/barangays';
import { findSilagoBarangayFeature } from '../data/silagoGeoJson';
import { useApp } from '../context/AppContext';
import { Barangay } from '../types';
import { SafeImage } from './SafeImage';

interface PublicBarangayDialogProps {
  barangay: Barangay;
  onClose: () => void;
}

export function PublicBarangayDialog({ barangay, onClose }: PublicBarangayDialogProps) {
  const { barangayProfiles, parcels } = useApp();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const name = getBarangayLabel(barangay.name, barangayProfiles);
  const feature = findSilagoBarangayFeature(barangay.name);
  const photos = [...new Set(parcels
    .filter((parcel) => !parcel.isPendingSync && !parcel.is_pending_sync && matchBarangay(parcel.barangay, barangay.name))
    .map((parcel) => (parcel.fieldPhotoUrl || parcel.landPhotoUrl || '').trim())
    .filter((url) => /^https?:\/\//i.test(url)))];

  useEffect(() => {
    const dialog = dialogRef.current;
    const container = mapRef.current;
    if (!dialog || !container) return;
    dialog.showModal();

    const center: L.LatLngTuple = feature?.properties.center || [barangay.lat, barangay.lng];
    const map = L.map(container, { scrollWheelZoom: false }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    if (feature) {
      const boundary = L.geoJSON(feature, {
        style: { color: '#1d4ed8', weight: 2, fillOpacity: 0.16 }
      }).addTo(map);
      const bounds = boundary.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    } else {
      L.circleMarker(center, { color: '#1d4ed8', radius: 6 }).addTo(map);
    }

    return () => {
      map.remove();
      dialog.close();
    };
  }, [feature, barangay.lat, barangay.lng]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl backdrop:bg-slate-950/55"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 id={titleId} className="text-xl font-bold">{name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {getBarangayZone(barangay.name, barangayProfiles)} · {barangay.puroks} puroks
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close barangay details" className="rounded-md p-2 hover:bg-slate-100">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div className="space-y-5 p-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Barangay map</h3>
          <div ref={mapRef} role="region" aria-label={`Map of ${name}`} className="relative isolate h-64 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 sm:h-80" />
          {!feature && <p className="mt-2 text-xs text-slate-600">The marker shows the barangay center.</p>}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Rice field photos</h3>
          {photos.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {photos.map((url, index) => (
                <SafeImage
                  key={url}
                  src={url}
                  alt={`Rice field in ${name}, photo ${index + 1}`}
                  className="aspect-video w-full rounded-lg object-cover"
                  containerClassName="block"
                  fallbackType="field"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No rice field photos are available for this barangay yet.</p>
          )}
        </section>
      </div>
    </dialog>
  );
}
