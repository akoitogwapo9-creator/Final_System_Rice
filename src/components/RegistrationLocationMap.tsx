import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TOTAL_SILAGO_STATS } from '../data/barangays';
import { OFFICE_LABEL_CLASS } from './OfficeFormPrimitives';

interface RegistrationLocationMapProps {
  latitude?: number;
  longitude?: number;
  onPick: (latitude: number, longitude: number) => void;
  disabled: boolean;
}

export function RegistrationLocationMap({ latitude, longitude, onPick, disabled }: RegistrationLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pickRef = useRef(onPick);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    pickRef.current = onPick;
    disabledRef.current = disabled;
    if (disabled) markerRef.current?.dragging?.disable();
    else markerRef.current?.dragging?.enable();
  }, [onPick, disabled]);

  useEffect(() => {
    if (!containerRef.current) return;
    const { lat, lng } = TOTAL_SILAGO_STATS.centerCoordinates;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([lat, lng], 14);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const pick = ({ lat, lng }: L.LatLng) => {
      if (!disabledRef.current) {
        pickRef.current(Number(lat.toFixed(6)), Number(L.Util.wrapNum(lng, [-180, 180], true).toFixed(6)));
      }
    };
    map.on('click', (event: L.LeafletMouseEvent) => pick(event.latlng));

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude == null || longitude == null ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        latitude === 0 || longitude === 0 || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const point = L.latLng(latitude, longitude);
    if (markerRef.current) {
      markerRef.current.setLatLng(point);
    } else {
      const marker = L.marker(point, {
        draggable: true,
        title: 'Farm location',
        alt: 'Farm location',
        icon: L.divIcon({
          className: 'rounded-full border-2 border-white bg-blue-700 shadow-md',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(map);
      if (disabledRef.current) marker.dragging?.disable();
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        pickRef.current(Number(lat.toFixed(6)), Number(L.Util.wrapNum(lng, [-180, 180], true).toFixed(6)));
      });
      markerRef.current = marker;
    }
    if (!map.getBounds().pad(-0.2).contains(point)) map.panTo(point, { animate: false });
  }, [latitude, longitude]);

  return (
    <div className="space-y-1">
      <p className={OFFICE_LABEL_CLASS}>Farm location map (optional)</p>
      <p className="text-xs text-slate-600">Click the map or drag the pin to update latitude and longitude.</p>
      <div
        ref={containerRef}
        role="region"
        aria-label="Farm location map"
        className="relative isolate z-0 h-56 overflow-hidden rounded-md border border-slate-300 bg-slate-100"
      />
    </div>
  );
}
