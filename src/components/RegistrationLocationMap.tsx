import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TOTAL_SILAGO_STATS } from '../data/barangays';
import { OFFICE_LABEL_CLASS } from './OfficeFormPrimitives';

interface RegistrationLocationMapProps {
  latitude?: number;
  longitude?: number;
  onPick: (latitude: number, longitude: number) => void;
  disabled: boolean;
  boundary?: [number, number][];
  onBoundaryChange?: (boundary: [number, number][]) => void;
}

export function RegistrationLocationMap({ latitude, longitude, onPick, disabled, boundary, onBoundaryChange }: RegistrationLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [drawing, setDrawing] = useState(false);
  const pickRef = useRef(onPick);
  const polygonRef = useRef<L.Polygon | null>(null);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    pickRef.current = (lat, lng) => {
      if (drawing && onBoundaryChange) onBoundaryChange([...(boundary || []), [lat, lng]]);
      else onPick(lat, lng);
    };
    disabledRef.current = disabled;
    if (disabled) markerRef.current?.dragging?.disable();
    else markerRef.current?.dragging?.enable();
  }, [onPick, disabled, drawing, boundary, onBoundaryChange]);

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
      polygonRef.current = null;
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

  useEffect(() => {
    polygonRef.current?.remove();
    if (mapRef.current && boundary?.length) {
      polygonRef.current = L.polygon(boundary, { color: '#047857', interactive: false }).addTo(mapRef.current);
    }
  }, [boundary]);

  return (
    <div className="space-y-1">
      <p className={OFFICE_LABEL_CLASS}>Farm location map (optional)</p>
      <p className="text-xs text-slate-600">{drawing ? 'Click each corner of the parcel in boundary order.' : 'Click the map or drag the pin to place the farm center.'}</p>
      {onBoundaryChange && <div className="flex flex-wrap gap-3 text-xs font-semibold text-emerald-800">
        <button type="button" disabled={disabled} onClick={() => {
          if (drawing && boundary && boundary.length >= 3) {
            onPick(
              boundary.reduce((sum, point) => sum + point[0], 0) / boundary.length,
              boundary.reduce((sum, point) => sum + point[1], 0) / boundary.length
            );
          }
          setDrawing(!drawing);
        }}>{drawing ? 'Finish boundary' : 'Draw boundary'}</button>
        <button type="button" disabled={!boundary?.length} onClick={() => onBoundaryChange(boundary?.slice(0, -1) || [])}>Undo vertex</button>
        <button type="button" disabled={!boundary?.length} onClick={() => onBoundaryChange([])}>Clear boundary</button>
        <span>{boundary?.length || 0} vertices</span>
      </div>}
      <div
        ref={containerRef}
        role="region"
        aria-label="Farm location map"
        className="relative isolate z-0 h-56 overflow-hidden rounded-md border border-slate-300 bg-slate-100"
      />
    </div>
  );
}
