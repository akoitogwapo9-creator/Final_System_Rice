import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useApp } from '../context/AppContext';
import { BARANGAYS, getBarangayClassifications, getBarangayLabel, getBarangayZone, matchBarangay } from '../data/barangays';
import { DECREE_CATEGORIES, LegalDecree } from '../data/legalDecrees';
import { findSilagoBarangayFeature } from '../data/silagoGeoJson';
import { findBarangayBoundary } from '../data/barangayBoundaries';
import { Barangay, PortalTab } from '../types';
import {
  FileText,
  MapPin,
  UserRound,
  SlidersHorizontal,
  Users,
  Search,
  Plus,
  Upload,
  RotateCcw,
  Pencil,
  Trash2,
  Map,
  ShieldCheck,
  Save,
  Eye,
  GripVertical,
  LockKeyhole,
  LogOut,
  Check,
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Crosshair,
  Undo2,
  X,
  Lock,
  Compass
} from 'lucide-react';
import { EditBarangayDialog } from '../components/EditBarangayDialog';
import { OfficeCustomFieldsGrid } from '../components/OfficeFormPrimitives';
import {
  DEFAULT_FORM_SECTIONS,
  DEFAULT_FORM_FIELDS,
  BUILTIN_FIELD_IDS,
  FormTarget,
  FORM_SCHEMA_EVENT,
  RegistryField as SharedRegistryField,
  RegistryFormSection,
  loadFormSchema,
  saveFormSchema
} from '../data/formSchema';

const card = 'rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.035)]';
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';

function PageBanner({ icon: Icon, title, subtitle, children }: { icon: React.ElementType; title: string; subtitle: string; children?: React.ReactNode }) {
  return <section className={`${card} mb-5 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6`}>
    <div className="flex min-w-0 items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"><Icon className="h-6 w-6" /></span><div><div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">Official Registry</div><h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{subtitle}</p></div></div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </section>;
}

const decreeCategories = DECREE_CATEGORIES;

export function LegalDecreesView({ readOnly = false }: { readOnly?: boolean }) {
  const {
    legalDecrees: docs,
    addLegalDecree,
    deleteLegalDecree,
    resetLegalDecrees,
    permissions
  } = useApp();
  const isCentralAdmin = !readOnly && permissions.isCentralAdmin;
  const [category, setCategory] = useState('All Documents');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', number: '', dateEnacted: '', category: 'Municipal Ordinances', summary: '', text: '' });
  const [notice, setNotice] = useState('');

  const filtered = docs.filter(
    (d: LegalDecree) =>
      (category === 'All Documents' || d.category === category) &&
      (!selected || d.id === selected) &&
      `${d.title} ${d.number} ${d.summary || ''}`.toLowerCase().includes(query.toLowerCase()) &&
      d.text.toLowerCase().includes(keyword.toLowerCase())
  );
  const counts = (c: string) => (c === 'All Documents' ? docs.length : docs.filter((d) => d.category === c).length);

  const add = () => {
    if (!isCentralAdmin || !draft.title.trim()) return;
    addLegalDecree(draft);
    setDraft({ title: '', number: '', dateEnacted: '', category: 'Municipal Ordinances', summary: '', text: '' });
    setManualOpen(false);
    setNotice('Legal decree saved & published to portal and public interface.');
    setTimeout(() => setNotice(''), 3500);
  };

  const importFile = async (file?: File) => {
    if (!isCentralAdmin || !file) return;
    const text = file.type === 'text/plain' ? await file.text() : `Imported document file: ${file.name}`;
    const name = file.name.replace(/\.[^.]+$/, '');
    addLegalDecree({
      title: name,
      number: 'Imported Document',
      category: 'Municipal Ordinances',
      dateEnacted: new Date().toISOString().slice(0, 10),
      summary: `Imported from ${file.name}`,
      text
    });
    setNotice(`${file.name} imported and published to the interface.`);
    setTimeout(() => setNotice(''), 3500);
  };

  return (
    <div>
      <PageBanner
        icon={FileText}
        title="Legal Decrees & Ordinances Management"
        subtitle="OFFICIAL LAW REGISTRY · Legislative database of enacted Municipal Ordinances, resolutions, executive orders, and national rice policies displayed across the portal and public interface."
      >
        {isCentralAdmin ? (
          <>
            <button className={secondary} onClick={() => setHistoryOpen(!historyOpen)}>
              Import History
            </button>
            <button
              className={secondary}
              onClick={() => {
                resetLegalDecrees();
                setNotice('Registry restored to official Silago municipal & national rice laws.');
                setTimeout(() => setNotice(''), 3500);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Reset to Official Laws
            </button>
            <label className={`${secondary} cursor-pointer`}>
              <Upload className="h-4 w-4" />
              Import Legal Document
              <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
            </label>
            <button className={primary} onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Manual Entry
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Read-Only Law Reference
          </span>
        )}
      </PageBanner>

      <section className={`${card} mb-5 grid gap-3 p-4 md:grid-cols-[minmax(220px,0.8fr)_1fr_1fr]`}>
        <select className={input} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select Legal Decree / Ordinance</option>
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.number ? `${d.number} · ` : ''}
              {d.title}
            </option>
          ))}
        </select>
        <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or ordinance number..." />
        <input className={input} placeholder="Search section or provision keyword..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </section>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
        {decreeCategories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 cursor-pointer rounded-full border px-4 py-2 text-xs font-semibold transition ${
              category === c ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
            }`}
          >
            {c}
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${category === c ? 'bg-white/20' : 'bg-slate-100'}`}>
              {counts(c)}
            </span>
          </button>
        ))}
      </div>

      {historyOpen && isCentralAdmin && (
        <section className={`${card} mb-5 p-5`}>
          <h3 className="font-semibold text-slate-900">Registry Document Log</h3>
          <p className="mt-1 text-sm text-slate-500">
            {docs.length} active legal decree{docs.length === 1 ? '' : 's'} synced to both the executive portal and public interface.
          </p>
          <div className="mt-3 divide-y divide-slate-100">
            {docs.slice(0, 8).map((d) => (
              <div key={d.id} className="flex justify-between py-2 text-sm">
                <span className="font-medium text-slate-700">{d.title}</span>
                <span className="text-slate-500">{d.category}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {manualOpen && isCentralAdmin && (
        <div className={`${card} mb-5 grid gap-3 p-5 sm:grid-cols-3`}>
          <input className={input} placeholder="Document title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <input className={input} placeholder="Ordinance / reference number" value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} />
          <select className={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {decreeCategories.slice(1, -1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className={input} type="date" placeholder="Date enacted" value={draft.dateEnacted} onChange={(e) => setDraft({ ...draft, dateEnacted: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Brief policy summary" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          <textarea className={`${input} min-h-24 sm:col-span-3`} placeholder="Full sections, provisions, or searchable legal text" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <div className="flex gap-2 sm:col-span-3">
            <button className={primary} onClick={add}>
              Save &amp; Publish Legal Document
            </button>
            <button className={secondary} onClick={() => setManualOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">{notice}</p>}

      <section className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-slate-900">{category}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{filtered.length} registered document{filtered.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {filtered.length ? (
          <div className="divide-y divide-slate-100">
            {filtered.map((d) => {
              const isExpanded = expandedId === d.id;
              return (
                <article key={d.id} className="px-5 py-4 transition hover:bg-slate-50/70">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {d.number && (
                          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                            {d.number}
                          </span>
                        )}
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {d.category}
                        </span>
                        {d.dateEnacted && <span className="text-[11px] text-slate-400">Enacted {d.dateEnacted}</span>}
                      </div>
                      <h4 className="mt-1.5 font-semibold text-slate-900">{d.title}</h4>
                      {d.summary && <p className="mt-1 text-xs leading-relaxed text-slate-600">{d.summary}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : d.id)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5 text-emerald-700" />
                        <span>{isExpanded ? 'Hide Text' : 'Read Provisions'}</span>
                      </button>
                      {isCentralAdmin && (
                        <button
                          className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => deleteLegalDecree(d.id)}
                          aria-label="Delete document"
                          title="Delete legal decree (Central Admin only)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
                      {d.text || 'Full provision text not yet uploaded.'}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" />
            <p className="font-medium text-slate-700">No legal documents in this category</p>
            <p className="mt-1 text-sm text-slate-500">
              {isCentralAdmin ? 'Import a source document or add a manual registry entry.' : 'Try selecting another policy category or clearing your search.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const rad = (n: number) => (n * Math.PI) / 180;

function polygonAreaHa(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const lat0 = rad(points.reduce((n, p) => n + p[0], 0) / points.length);
  const xy = points.map(([lat, lng]) => [rad(lng) * 6371008.8 * Math.cos(lat0), rad(lat) * 6371008.8]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i],
      b = xy[(i + 1) % xy.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area / 2) / 10000;
}

function perimeterKm(points: [number, number][]): number {
  if (points.length < 2) return 0;
  const edges = points
    .map((a, i) => [a, points[(i + 1) % points.length]] as [[number, number], [number, number]])
    .slice(0, points.length >= 3 ? points.length : points.length - 1);
  return edges.reduce((sum, [a, b]) => {
    const dLat = rad(b[0] - a[0]),
      dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return sum + 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }, 0);
}

function getOfficialBoundaryPoints(name: string): [number, number][] {
  const boundary = findBarangayBoundary(name);
  if (boundary && boundary.polygon && boundary.polygon.length > 0) {
    return boundary.polygon;
  }
  const geometry = findSilagoBarangayFeature(name)?.geometry;
  if (!geometry) return [];
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  return Array.isArray(ring) ? ring.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]) : [];
}

interface InlineSurveyMapProps {
  barangay: Barangay;
  points: [number, number][];
  onPointsChange: (pts: [number, number][]) => void;
  center: [number, number];
  onCenterChange: (c: [number, number]) => void;
}

function InlineBarangaySurveyMap({ barangay, points, onPointsChange, center, onCenterChange }: InlineSurveyMapProps) {
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapesRef = useRef<L.LayerGroup | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return;
    const map = L.map(mapHostRef.current, { center, zoom: 14, zoomControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    shapesRef.current = group;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const newPt: [number, number] = [e.latlng.lat, e.latlng.lng];
      onPointsChange([...pointsRef.current, newPt]);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      shapesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (points.length >= 3) {
      try {
        const bounds = L.latLngBounds(points);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [35, 35] });
          return;
        }
      } catch {}
    }
    map.setView(center, 14);
  }, [barangay.name]);

  useEffect(() => {
    const map = mapRef.current;
    const group = shapesRef.current;
    if (!map || !group) return;
    group.clearLayers();

    if (points.length >= 3) {
      L.polygon(points, {
        color: '#059669',
        weight: 2.5,
        fillColor: '#10b981',
        fillOpacity: 0.22
      }).addTo(group);
    }

    const markerStride = points.length > 36 ? Math.ceil(points.length / 28) : 1;
    points.forEach((point, index) => {
      if (index % markerStride !== 0 && index !== points.length - 1) return;
      const marker = L.marker(point, {
        draggable: true,
        icon: L.divIcon({
          className: '',
          html: `<span style="display:flex;width:18px;height:18px;align-items:center;justify-content:center;border:2px solid #059669;border-radius:50%;background:white;color:#1c1917;font-size:9px;font-weight:700;box-shadow:0 1px 4px #0f172a55">${index + 1}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(group);

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        onPointsChange(points.map((p, i) => (i === index ? [lat, lng] : p)));
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        if (points.length > 3) {
          onPointsChange(points.filter((_, i) => i !== index));
        }
      });
    });

    const centerMarker = L.marker(center, {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: `<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center;border:2px solid white;border-radius:50%;background:#059669;font-size:14px;box-shadow:0 2px 6px #0f172a66">🏛️</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })
    }).bindTooltip(`${barangay.name} Center`);

    centerMarker.on('dragend', () => {
      const { lat, lng } = centerMarker.getLatLng();
      onCenterChange([Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
    });
    centerMarker.addTo(group);
  }, [points, center, barangay.name]);

  return <div ref={mapHostRef} className="h-full w-full" />;
}

export function BarangaysView({ onNavigate, onMeasureBarangay }: { onNavigate: (tab: PortalTab) => void; onMeasureBarangay: (barangay: Barangay) => void }) {
  const { lftAccounts, parcels, permissions, barangayProfiles, updateBarangayProfile } = useApp();
  if (!permissions.isCentralAdmin) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-amber-700" />
        <h3 className="font-bold text-base">Administrator Access Required</h3>
        <p className="mt-1 text-xs">Barangay boundary configuration and GIS sector management are restricted to Central Admin.</p>
      </div>
    );
  }
  const [query, setQuery] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [boundaryEditorOpen, setBoundaryEditorOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const surveyorTopRef = useRef<HTMLDivElement | null>(null);

  const getSavedSettings = (): Record<string, any> => {
    try {
      return JSON.parse(localStorage.getItem('silago_gis_measure_settings') || '{}');
    } catch {
      return {};
    }
  };

  const getSavedPoints = (): Record<string, [number, number][]> => {
    try {
      return JSON.parse(localStorage.getItem('silago_gis_measure_points') || '{}');
    } catch {
      return {};
    }
  };

  const [savedSettingsState, setSavedSettingsState] = useState(getSavedSettings);
  const [savedPointsState, setSavedPointsState] = useState(getSavedPoints);

  const rows = useMemo(() => {
    return BARANGAYS.map((barangay, index) => {
      const saved = savedSettingsState[barangay.name] || {};
      const profile = barangayProfiles[barangay.name];
      const officer = lftAccounts.find((account) =>
        (account.assignedBarangays || []).some((name) => matchBarangay(name, barangay.name)) ||
        matchBarangay(account.barangay, barangay.name)
      );
      const officialArea = findSilagoBarangayFeature(barangay.name)?.properties.areaHa || 0;
      const farmCount = parcels.filter((parcel) => matchBarangay(parcel.barangay, barangay.name)).length;
      return {
        ...barangay,
        number: index + 1,
        totalAreaHa: saved.areaHa || officialArea || barangay.totalAreaHa,
        terrain: saved.zone || barangay.terrain,
        lat: Number(saved.centerLat ?? barangay.lat),
        lng: Number(saved.centerLng ?? barangay.lng),
        focalPerson: saved.focalPerson || officer?.name || barangay.focalPerson || '',
        contactNumber: saved.contactNumber || officer?.contactNumber || barangay.contactNumber || '',
        ...profile?.details,
        farmCount,
        assigned: Boolean(officer),
        hasSavedBoundary: Boolean(profile?.boundary === undefined ? savedPointsState[barangay.name]?.length : profile.boundary?.length)
      };
    });
  }, [lftAccounts, parcels, savedSettingsState, savedPointsState, barangayProfiles]);

  const filteredRows = rows.filter((row) => {
    const zone = getBarangayZone(row.name, barangayProfiles);
    return (!zoneFilter || (zoneFilter === 'non-coastal' ? zone !== 'Coastal' : zone === zoneFilter)) &&
      `${getBarangayLabel(row.name, barangayProfiles)} ${row.focalPerson} ${row.terrain}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  const zoneColors: Record<string, string> = {
    Coastal: 'border-blue-200 bg-blue-50 text-blue-800',
    Upland: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    'Lowland / Plain': 'border-amber-200 bg-amber-50 text-amber-800',
    'Poblacion / Urban': 'border-violet-200 bg-violet-50 text-violet-800',
    'Island / Riverside': 'border-cyan-200 bg-cyan-50 text-cyan-800'
  };

  // Active barangay for top GIS surveyor map
  const [activeBarangay, setActiveBarangay] = useState<Barangay>(rows[0]);
  const pointsForBarangay = (name: string) => {
    const boundary = barangayProfiles[name]?.boundary;
    return boundary === null ? getOfficialBoundaryPoints(name) : boundary || getSavedPoints()[name] || getOfficialBoundaryPoints(name);
  };
  const [points, setPoints] = useState<[number, number][]>(() => pointsForBarangay(activeBarangay.name));
  const [centerCoords, setCenterCoords] = useState<[number, number]>([activeBarangay.lat, activeBarangay.lng]);
  const savedBoundary = barangayProfiles[activeBarangay.name]?.boundary;
  useEffect(() => {
    if (savedBoundary !== undefined) setPoints(pointsForBarangay(activeBarangay.name));
  }, [activeBarangay.name, savedBoundary]);

  const measuredAreaHa = useMemo(() => polygonAreaHa(points), [points]);
  const measuredPerimeterKm = useMemo(() => perimeterKm(points), [points]);

  const handleSelectBarangay = (b: Barangay) => {
    setActiveBarangay(b);
    setCenterCoords([b.lat, b.lng]);
    setPoints(pointsForBarangay(b.name));
    setBoundaryEditorOpen(true);
    surveyorTopRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleAutoGenerateBoundary = () => {
    const official = getOfficialBoundaryPoints(activeBarangay.name);
    setPoints(official);
    setNotice(`Official boundary loaded for ${activeBarangay.name} (${official.length} points).`);
    setTimeout(() => setNotice(''), 3500);
  };

  const handleUndoPoint = () => {
    setPoints((prev) => prev.slice(0, -1));
  };

  const handleClearPoints = () => {
    setPoints([]);
  };

  const handleSaveBoundary = async () => {
    if (!permissions.isCentralAdmin) return;
    if (points.length < 3) { setNotice('Add at least three points to save a boundary.'); return; }
    try {
      const allPoints = getSavedPoints();
      allPoints[activeBarangay.name] = points;
      localStorage.setItem('silago_gis_measure_points', JSON.stringify(allPoints));
      setSavedPointsState(allPoints);

      const allSettings = getSavedSettings();
      allSettings[activeBarangay.name] = {
        ...allSettings[activeBarangay.name],
        centerLat: centerCoords[0],
        centerLng: centerCoords[1],
        areaHa: measuredAreaHa,
        perimeterKm: measuredPerimeterKm
      };
      localStorage.setItem('silago_gis_measure_settings', JSON.stringify(allSettings));
      setSavedSettingsState(allSettings);

      const previous = barangayProfiles[activeBarangay.name];
      const synced = await updateBarangayProfile(activeBarangay.name, {
        displayName: getBarangayLabel(activeBarangay.name, barangayProfiles),
        classification: getBarangayZone(activeBarangay.name, barangayProfiles),
        details: { ...previous?.details, totalAreaHa: measuredAreaHa, lat: centerCoords[0], lng: centerCoords[1] },
        boundary: points
      });
      setNotice(synced ? 'Boundary and measured area saved.' : 'Boundary saved on this device. Cloud sync is pending.');
      setTimeout(() => setNotice(''), 4000);
    } catch {
      setNotice('Unable to save boundary coordinates on this browser.');
    }
  };

  const handleCancelMeasure = () => {
    setPoints(pointsForBarangay(activeBarangay.name));
    setNotice('Changes cancelled.');
    setTimeout(() => setNotice(''), 3000);
  };

  const handleDeleteBoundary = async (b: Barangay) => {
    if (!permissions.isCentralAdmin) return;
    if (window.confirm(`Reset boundary for ${b.name} to official default?`)) {
      const allPoints = getSavedPoints();
      delete allPoints[b.name];
      localStorage.setItem('silago_gis_measure_points', JSON.stringify(allPoints));
      setSavedPointsState(allPoints);

      const allSettings = getSavedSettings();
      if (allSettings[b.name]) {
        delete allSettings[b.name].areaHa;
        delete allSettings[b.name].perimeterKm;
      }
      localStorage.setItem('silago_gis_measure_settings', JSON.stringify(allSettings));
      setSavedSettingsState(allSettings);

      if (activeBarangay.name === b.name) {
        setPoints(getOfficialBoundaryPoints(b.name));
      }
      const official = BARANGAYS.find(({ name }) => name === b.name);
      const synced = await updateBarangayProfile(b.name, {
        displayName: getBarangayLabel(b.name, barangayProfiles), classification: getBarangayZone(b.name, barangayProfiles),
        details: { ...barangayProfiles[b.name]?.details, totalAreaHa: findSilagoBarangayFeature(b.name)?.properties.areaHa || official?.totalAreaHa },
        boundary: null
      });
      setNotice(synced ? `Boundary reset for ${b.name}.` : 'Boundary reset on this device. Cloud sync is pending.');
      setTimeout(() => setNotice(''), 3500);
    }
  };

  const [editingBarangayModal, setEditingBarangayModal] = useState<Barangay | null>(null);

  const handleUpdateBarangay = (name: string, updates: Partial<Barangay>, synced: boolean) => {
    if (!permissions.isCentralAdmin) return;
    try {
      const allSettings = getSavedSettings();
      allSettings[name] = {
        ...allSettings[name],
        focalPerson: updates.focalPerson,
        contactNumber: updates.contactNumber,
        zone: updates.terrain,
        puroks: updates.puroks,
        areaHa: updates.totalAreaHa,
        centerLat: updates.lat,
        centerLng: updates.lng
      };
      localStorage.setItem('silago_gis_measure_settings', JSON.stringify(allSettings));
      setSavedSettingsState(allSettings);

      if (activeBarangay.name === name) {
        setActiveBarangay((prev) => ({ ...prev, ...updates }));
        if (updates.lat !== undefined && updates.lng !== undefined) {
          setCenterCoords([updates.lat, updates.lng]);
        }
      }

      setNotice(synced ? `Barangay ${getBarangayLabel(name, barangayProfiles)} updated.` : 'Barangay saved on this device. Cloud sync is pending.');
      setTimeout(() => setNotice(''), 4000);
    } catch {
      // ignore
    }
  };

  return (
    <div ref={surveyorTopRef} className="mx-auto w-full max-w-6xl space-y-4 px-1 py-1 sm:px-2">
      {/* 1. TOP SECTION: INTERACTIVE LIVE GIS BOUNDARY SURVEYOR MAP (Matching Reference Image 2) */}
      <section className={`${card} space-y-3 p-3`}>
        <button type="button" aria-expanded={boundaryEditorOpen} onClick={() => setBoundaryEditorOpen(!boundaryEditorOpen)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-blue-900">
          <span>Boundary Survey · {getBarangayLabel(activeBarangay.name, barangayProfiles)}</span>
          {boundaryEditorOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {boundaryEditorOpen && <div className="space-y-3">
        {/* Top controls above map */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAutoGenerateBoundary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              <span>Load Official Boundary</span>
            </button>
            {rows.find((row) => row.name === activeBarangay.name)?.hasSavedBoundary && (
              <button type="button" onClick={() => handleDeleteBoundary(activeBarangay)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Reset Saved Boundary
              </button>
            )}
            <button
              type="button"
              onClick={handleUndoPoint}
              disabled={points.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Undo Point</span>
            </button>
            <button
              type="button"
              onClick={handleClearPoints}
              disabled={points.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Points</span>
            </button>
          </div>
        </div>

        {/* Live Leaflet Map Canvas */}
        <div className="h-[320px] sm:h-[350px] w-full rounded-2xl overflow-hidden border border-slate-200 relative bg-slate-100">
          <InlineBarangaySurveyMap
            key={activeBarangay.name}
            barangay={activeBarangay}
            points={points}
            onPointsChange={setPoints}
            center={centerCoords}
            onCenterChange={setCenterCoords}
          />
          <div className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-800 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Active Survey: Brgy. {activeBarangay.name}</span>
            <span className="text-slate-400 font-normal">({points.length} vertices)</span>
          </div>
        </div>

        {/* Bottom bar below map */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="text-xs text-slate-600 font-medium">
            Measured Area:{' '}
            <strong className="text-emerald-700 font-bold">{measuredAreaHa.toFixed(2)} Hectares</strong>
            {' • '}
            Perimeter: <strong className="text-blue-700 font-bold">{measuredPerimeterKm.toFixed(3)} km</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancelMeasure}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBoundary}
              className="px-4 py-1.5 rounded-xl bg-[#15803d] hover:bg-[#166534] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Barangay &amp; Boundary</span>
            </button>
          </div>
        </div>
        </div>}
      </section>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 2. BOTTOM SECTION: SEARCH & BARANGAYS TABLE (Matching Reference Image 2) */}
      <section className={`${card} overflow-hidden`}>
        {/* Search bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search barangay or focal person..."
              className="w-full pl-10 pr-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <select aria-label="Filter by barangay zone" value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <option value="">All Zones</option>
            <option value="non-coastal">All Non-Coastal Zones</option>
            {getBarangayClassifications(barangayProfiles).map((zone) => <option key={zone}>{zone}</option>)}
          </select>
          <span className="text-xs text-slate-400 font-medium">
            Total: {filteredRows.length} barangays
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3">Barangay Name</th>
                <th className="px-4 py-3">Zone &amp; Terrain</th>
                <th className="px-4 py-3">Area &amp; Coordinates</th>
                <th className="px-4 py-3">Focal Person &amp; Contact</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredRows.map((b) => (
                <tr key={b.name} className="transition hover:bg-slate-50/80">
                  <td className="px-4 py-3.5 font-semibold text-slate-900">
                    {getBarangayLabel(b.name, barangayProfiles)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${zoneColors[getBarangayZone(b.name, barangayProfiles)] || 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      {getBarangayZone(b.name, barangayProfiles)}
                    </span>
                    <div className="mt-1 text-slate-600">{b.terrain}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-800">{b.totalAreaHa == null ? '—' : `${b.totalAreaHa.toLocaleString()} ha`}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-600">{b.lat.toFixed(5)}, {b.lng.toFixed(5)}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-800">{b.focalPerson || '—'}</div>
                    <div className="mt-1 text-slate-600">{b.contactNumber || '—'}</div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingBarangayModal(b)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1 transition cursor-pointer"
                        title="Edit barangay details"
                      >
                        <Pencil className="w-3 h-3 text-blue-700" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectBarangay(b)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 transition cursor-pointer"
                      >
                        <Compass className="w-3 h-3 text-emerald-700" />
                        <span>GIS Boundary</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-slate-400">
                    No barangays match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editingBarangayModal && (
        <EditBarangayDialog
          key={editingBarangayModal.name}
          barangay={editingBarangayModal}
          onClose={() => setEditingBarangayModal(null)}
          onSave={(updates, synced) => {
            handleUpdateBarangay(editingBarangayModal.name, updates, synced);
            setEditingBarangayModal(null);
          }}
        />
      )}
    </div>
  );
}

export function AccountProfileView({ onSignOut }: { onSignOut: () => void }) {
  const { currentUser, updateCurrentUserProfile, updateCurrentUserPassword } = useApp();
  const [name, setName] = useState(currentUser?.name || 'Admin');
  const [phone, setPhone] = useState(currentUser?.contactNumber || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');

  const save = () => {
    updateCurrentUserProfile({ name, contactNumber: phone });
    setNotice('Profile changes saved successfully.');
    setTimeout(() => setNotice(''), 4000);
  };

  const password = async () => {
    if (next.length < 6 || next !== confirm) {
      setNotice('Use at least 6 characters and confirm the new password.');
      return;
    }
    const passwordError = await updateCurrentUserPassword(current, next);
    if (passwordError) {
      setNotice(passwordError);
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setNotice('Password updated successfully.');
    setTimeout(() => setNotice(''), 4000);
  };

  const isCentralAdmin = currentUser?.role === 'Central Admin';
  const roleTitle = isCentralAdmin ? 'System Administrator / MAO Officer' : 'Agricultural Extension Focal Person';
  const accountId = currentUser?.id || '870624d4-cf09-4392-9704-3c5e25db3f0c';
  const username = currentUser?.username || 'admin';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-1 py-1 sm:px-2">
      {/* 1. Header Account Identity Card */}
      <section className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6`}>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1e40af] text-2xl font-bold text-white shadow-sm">
            {(name || 'A').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-slate-900">{name || 'Admin'}</h2>
              <span className="inline-flex rounded-full bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                {roleTitle}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400 font-mono">
              Account ID: {accountId} · Username: @{username}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-rose-600 self-start sm:self-auto cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </section>

      {/* 2. Dual Column: Profile Info & Security Password */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left Column: Officer Profile & Contact Info */}
        <section className={`${card} p-5 sm:p-6 space-y-4`}>
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <UserRound className="h-4 w-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">Officer Profile &amp; Contact Info</h3>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Legal / Display Name</label>
            <input
              type="text"
              className={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Admin"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Official Mobile / Contact Number</label>
            <input
              type="text"
              className={input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0917-123-4561"
            />
            <span className="mt-1 block text-[11px] text-slate-400 leading-normal">
              Used for official SMS dispatches and emergency agricultural coordination.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Username</div>
              <div className="mt-1 text-xs font-bold text-slate-800 font-mono">@{username}</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Role</div>
              <div className="mt-1 text-xs font-bold text-slate-800 uppercase">{isCentralAdmin ? 'ADMIN' : 'FIELD OFFICER'}</div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-2 rounded-xl bg-[#15803d] hover:bg-[#166534] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>Save Profile Changes</span>
            </button>
          </div>
        </section>

        {/* Right Column: Account Security & Password */}
        <section className={`${card} p-5 sm:p-6 space-y-4`}>
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <LockKeyhole className="h-4 w-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">Account Security &amp; Password</h3>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Current Password</label>
            <input
              type="password"
              className={input}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Enter current password"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">New Password</label>
              <input
                type="password"
                className={input}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                className={input}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-type new password"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Keep your credentials secure. As a designated officer, your login authorizes rice registrations, certificate verifications, and seasonal reports.
          </p>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={password}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1e293b] hover:bg-[#0f172a] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Update Password</span>
            </button>
          </div>
        </section>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 flex items-center gap-2 animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* 3. Bottom Protocols Banner */}
      <section className="rounded-3xl bg-[#173b2c] p-6 text-white shadow-md border border-emerald-950/20 space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-emerald-300" />
          <h3 className="text-base font-bold text-white">Barangay Rice Registry &amp; Field Technician Protocols</h3>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="text-xs font-bold text-emerald-300">1. RSBSA &amp; GIS Boundary Mapping</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Ensure all irrigated, rainfed, and upland rice farmers in your barangay are enrolled with verified GPS coordinates and RSBSA stubs.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="text-xs font-bold text-emerald-300">2. Crop Health &amp; Pest Monitoring</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Report rice blast, tungro, brown planthopper, or flood damage advisories promptly to the Municipal Agriculture Office.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1.5 backdrop-blur-xs">
            <div className="text-xs font-bold text-emerald-300">3. Harvest &amp; Seed Subsidy Verification</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Verify Wet &amp; Dry season harvest weights, certified inbred/hybrid seed deliveries, and NIA irrigation schedules prior to certification.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

const FORM_SCHEMA_DRAFT_KEY = 'silago_form_schema_draft_v3';

function loadDraftOrPublishedSchema() {
  if (typeof window !== 'undefined') {
    try {
      const draftRaw = localStorage.getItem(FORM_SCHEMA_DRAFT_KEY);
      if (draftRaw) {
        const parsed = JSON.parse(draftRaw);
        if (Array.isArray(parsed?.sections) && Array.isArray(parsed?.fields)) {
          return {
            sections: parsed.sections as RegistryFormSection[],
            fields: parsed.fields as SharedRegistryField[],
            isDraft: true
          };
        }
      }
    } catch {}
  }
  const published = loadFormSchema();
  return { ...published, isDraft: false };
}

const FORM_NAMES: Record<FormTarget, string> = {
  registration: 'Rice Farm Registration Form',
  crop: 'Crop & Planting Record Form'
};
const FIELD_TYPES: Record<string, string> = {
  'Text Field': 'Text', 'Text Area': 'Long text', 'Dropdown Menu': 'Dropdown',
  'Date Field': 'Date', 'Number Field': 'Number'
};
const CORE_LOCK_NOTE = 'This field is built into the registry and cannot be deleted or change type.';
const builderButton = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-blue-50 disabled:opacity-40';
const builderPrimary = 'rounded-md bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800';
const builderInput = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';

function BuilderSwitch({ label, fieldName, checked, disabled, onChange }: {
  label: string; fieldName: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-700"
      title={disabled ? 'Turn off Required before hiding this core field.' : undefined}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} className="peer sr-only"
        aria-label={`${label}: ${fieldName}`} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" className="relative h-4 w-7 rounded-full bg-slate-400 after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-blue-700 peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50" />
      {label}
    </label>
  );
}

export function RegistryFormCustomizationView() {
  const { barangayProfiles, varieties, ecosystems, irrigationAssociations, tenures, seasons } = useApp();
  const [initial] = useState(loadDraftOrPublishedSchema);
  const [sections, setSections] = useState(initial.sections);
  const [fields, setFields] = useState(initial.fields);
  const [formTarget, setFormTarget] = useState<FormTarget>('registration');
  const [sectionIds, setSectionIds] = useState<Partial<Record<FormTarget, string>>>({});
  const [dirty, setDirty] = useState(initial.isDraft);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ field: SharedRegistryField; options: string; isNew: boolean } | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});

  const formSections = sections.filter((section) => section.formTarget === formTarget);
  const activeSection = formSections.find((section) => section.id === sectionIds[formTarget]) || formSections[0];
  const sectionFields = fields.filter((field) => field.formTarget === formTarget && field.section === activeSection?.label);
  const visibleFields = sectionFields.filter((field) => field.visible !== false);
  const coreField = (field: SharedRegistryField) => field.isCore || BUILTIN_FIELD_IDS.has(field.id);

  const saveDraft = (nextSections = sections, nextFields = fields) => {
    localStorage.setItem(FORM_SCHEMA_DRAFT_KEY, JSON.stringify({ sections: nextSections, fields: nextFields }));
  };

  const change = (nextFields = fields, nextSections = sections) => {
    setFields(nextFields);
    setSections(nextSections);
    setDirty(true);
    setNotice('');
    try { saveDraft(nextSections, nextFields); } catch {}
  };

  useEffect(() => {
    if (dirty) return;
    const reload = () => {
      const latest = loadFormSchema();
      setSections(latest.sections);
      setFields(latest.fields);
    };
    window.addEventListener(FORM_SCHEMA_EVENT, reload);
    return () => window.removeEventListener(FORM_SCHEMA_EVENT, reload);
  }, [dirty]);

  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    const synced = await saveFormSchema(sections, fields, true);
    // Keep a draft made during an in-flight publish.
    try {
      const draft = localStorage.getItem(FORM_SCHEMA_DRAFT_KEY);
      if (!draft || draft === JSON.stringify({ sections, fields })) {
        localStorage.removeItem(FORM_SCHEMA_DRAFT_KEY);
        setDirty(false);
      }
    } catch {}
    setPublishing(false);
    setNotice(synced ? 'Form changes published.' : 'Form changes applied on this device. Cloud sync is pending.');
  };

  const reset = () => {
    change(DEFAULT_FORM_FIELDS, DEFAULT_FORM_SECTIONS);
    setSectionIds({});
    setResetOpen(false);
    setNotice('Defaults restored in the draft. Publish to apply them.');
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = sectionFields[index + direction];
    if (!target) return;
    const current = sectionFields[index];
    change(fields.map((field) => field.id === current.id ? target : field.id === target.id ? current : field));
  };

  const openField = (field?: SharedRegistryField) => {
    if (!activeSection) return;
    setEditor({
      field: field || {
        id: crypto.randomUUID(), formTarget, section: activeSection.label, name: '',
        fieldType: 'Text Field', visible: true, required: false
      },
      options: field?.options?.join('\n') || '',
      isNew: !field
    });
  };

  const saveField = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor?.field.name.trim()) return;
    const options = [...new Set(editor.options.split(/[\n,]/).map((option) => option.trim()).filter(Boolean))];
    const field = {
      ...editor.field, name: editor.field.name.trim(),
      options: coreField(editor.field) ? editor.field.options : options
    };
    change(editor.isNew ? [...fields, field] : fields.map((item) => item.id === field.id ? field : item));
    setEditor(null);
  };

  const previewOptions: Record<string, string[]> = {
    'reg-res-barangay': BARANGAYS.map(({ name }) => getBarangayLabel(name, barangayProfiles)),
    'reg-farm-barangay': BARANGAYS.map(({ name }) => getBarangayLabel(name, barangayProfiles)),
    'crop-variety': varieties.map(({ name }) => name),
    'crop-seed-type': ['Inbred (RCEF)', 'Hybrid', 'Unknown / Farmer Saved'],
    'crop-ecosystem': ecosystems, 'crop-ia': irrigationAssociations, 'crop-tenure': tenures, 'crop-season': seasons
  };

  const rowButton = "inline-flex items-center rounded border border-slate-200 px-1.5 py-0.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-30";

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[100rem] flex-col gap-2 overflow-hidden">
      <header className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-blue-950">Form Customization</h1>
          <span className="text-xs text-slate-600">{dirty ? 'Unpublished changes' : 'Published settings'}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={builderButton} onClick={() => setResetOpen(true)}>Reset Default</button>
          <button type="button" className={builderButton} onClick={() => {
            try { saveDraft(); setNotice('Draft saved on this device.'); } catch { setNotice('Draft could not be saved on this device.'); }
          }}>Save Draft</button>
          <button type="button" className={builderPrimary} onClick={publish} disabled={publishing}>{publishing ? 'Publishing…' : 'Publish Form Changes'}</button>
        </div>
      </header>

      <nav aria-label="Form switcher" className="grid shrink-0 grid-cols-2 gap-1 rounded-lg border border-blue-100 bg-white p-1">
        {(Object.keys(FORM_NAMES) as FormTarget[]).map((target) => (
          <button key={target} type="button" aria-pressed={target === formTarget} onClick={() => setFormTarget(target)}
            className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${target === formTarget ? 'bg-blue-700 text-white' : 'text-blue-950 hover:bg-blue-50'}`}>
            {FORM_NAMES[target]}
          </button>
        ))}
      </nav>

      <nav aria-label="Form sections" className="flex shrink-0 flex-wrap gap-1">
        {formSections.map((section) => (
          <button key={section.id} type="button" aria-pressed={activeSection?.id === section.id}
            className={`${builderButton} aria-pressed:border-blue-400 aria-pressed:bg-blue-50 aria-pressed:text-blue-900`}
            onClick={() => setSectionIds({ ...sectionIds, [formTarget]: section.id })}>{section.label}</button>
        ))}
        <button type="button" className={builderButton} onClick={() => setNewSection('')}>Add Section</button>
      </nav>
      {notice && <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</p>}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2 overflow-hidden lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-rows-1">
        <section className="flex min-h-0 min-w-0 flex-col gap-1">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-blue-950">{activeSection?.label}</h2>
            <div className="flex flex-wrap gap-2">
              {activeSection && !activeSection.isCore && (
                <button type="button" className={builderButton} onClick={() => {
                  if (!window.confirm('Delete this custom section and its fields from the draft?')) return;
                  change(fields.filter((field) => field.formTarget !== formTarget || field.section !== activeSection.label),
                    sections.filter((section) => section.id !== activeSection.id));
                }}>Delete Section</button>
              )}
              <button type="button" className={builderButton} onClick={() => openField()}>Add Field</button>
            </div>
          </header>
          <div className="min-h-0 space-y-1 overflow-auto overscroll-contain">
          {sectionFields.map((field, index) => (
            <article key={field.id} className="flex min-w-[460px] items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 title={field.name} className="truncate text-sm font-semibold text-slate-900">{field.name}</h3>
                <span className="shrink-0 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-800">
                  {FIELD_TYPES[field.fieldType || 'Text Field'] || field.fieldType}
                </span>
                {coreField(field) && <span tabIndex={0} title={CORE_LOCK_NOTE} aria-label={CORE_LOCK_NOTE} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-600"><Lock className="h-3 w-3" /> Core</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-2">
                  <BuilderSwitch label="Required" fieldName={field.name} checked={field.required}
                    onChange={(checked) => change(fields.map((item) => item.id === field.id
                      ? { ...item, required: checked, visible: checked || item.visible } : item))} />
                  <BuilderSwitch label="Show" fieldName={field.name} checked={field.visible !== false}
                    disabled={Boolean(coreField(field) && field.required)}
                    onChange={(checked) => change(fields.map((item) => item.id === field.id
                      ? { ...item, visible: checked, required: checked && item.required } : item))} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className={rowButton} disabled={index === 0} aria-label={`Move ${field.name} up`} onClick={() => move(index, -1)}><ChevronUp size={14} /></button>
                  <button type="button" className={rowButton} disabled={index === sectionFields.length - 1} aria-label={`Move ${field.name} down`} onClick={() => move(index, 1)}><ChevronDown size={14} /></button>
                  <button type="button" className={rowButton} onClick={() => openField(field)}>Edit</button>
                  {!coreField(field) && <button type="button" className={rowButton} onClick={() => change(fields.filter((item) => item.id !== field.id))}>Delete</button>}
                </div>
              </div>
            </article>
          ))}
          {!sectionFields.length && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No fields in this section.</p>}
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-col rounded-lg border border-blue-100 bg-white p-3" aria-label="Live form preview">
          <h2 className="font-semibold text-blue-950">Live Form Preview</h2>
          <p className="my-2 rounded-md bg-blue-50 p-2 text-xs text-blue-900">
            Interactive Preview — Changes apply to live forms once you click Publish Form Changes
          </p>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
          <h3 className="text-sm font-semibold text-slate-800">{activeSection?.label}</h3>
          {visibleFields.length ? (
            <OfficeCustomFieldsGrid
              fields={visibleFields.map((field) => ({
                ...field, fieldType: field.fieldType === 'Barangay Selector' ? 'Dropdown Menu' : field.fieldType,
                options: previewOptions[field.id] || field.options
              }))}
              values={previewValues}
              onChange={(id, value) => setPreviewValues((previous) => ({ ...previous, [id]: value }))}
            />
          ) : <p className="mt-3 text-sm text-slate-600">No fields are visible in this section.</p>}
          </div>
        </aside>
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form role="dialog" aria-modal="true" aria-label={editor.isNew ? 'Add Field' : 'Edit Field'} onSubmit={saveField}
            className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-auto rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-blue-950">{editor.isNew ? 'Add Field' : 'Edit Field'}</h2>
            <label className="block text-sm">Field Label
              <input required className={builderInput} value={editor.field.name} onChange={(event) => setEditor({ ...editor, field: { ...editor.field, name: event.target.value } })} />
            </label>
            <label className="block text-sm">Field Type
              <select className={builderInput} disabled={Boolean(coreField(editor.field))} title={CORE_LOCK_NOTE}
                value={editor.field.fieldType || 'Text Field'} onChange={(event) => setEditor({ ...editor, field: { ...editor.field, fieldType: event.target.value } })}>
                {[...new Set([...Object.keys(FIELD_TYPES), editor.field.fieldType || 'Text Field'])].map((type) => <option key={type} value={type}>{FIELD_TYPES[type] || type}</option>)}
              </select>
            </label>
            <label className="block text-sm">Placeholder
              <input className={builderInput} value={editor.field.placeholder || ''} onChange={(event) => setEditor({ ...editor, field: { ...editor.field, placeholder: event.target.value } })} />
            </label>
            <label className="block text-sm">Helper description
              <textarea className={builderInput} value={editor.field.helpText || ''} onChange={(event) => setEditor({ ...editor, field: { ...editor.field, helpText: event.target.value } })} />
            </label>
            {editor.field.fieldType === 'Dropdown Menu' && !coreField(editor.field) && (
              <label className="block text-sm">Dropdown choices, one per line
                <textarea required className={builderInput} value={editor.options} onChange={(event) => setEditor({ ...editor, options: event.target.value })} />
              </label>
            )}
            {editor.field.fieldType === 'Dropdown Menu' && coreField(editor.field) && <p className="text-xs text-slate-600">Manage these choices using the reference lists in the live form.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={builderButton} onClick={() => setEditor(null)}>Cancel</button>
              <button type="submit" className={builderPrimary}>Save Field</button>
            </div>
          </form>
        </div>
      )}

      {newSection !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form aria-label="Add Section" role="dialog" aria-modal="true" className="w-full max-w-md space-y-3 rounded-lg bg-white p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const label = newSection.trim();
              if (!label || sections.some((section) => section.label.toLowerCase() === label.toLowerCase())) {
                setNotice('Choose a unique section name.');
                return;
              }
              const id = crypto.randomUUID();
              change(fields, [...sections, { id, label, formTarget, description: '' }]);
              setSectionIds({ ...sectionIds, [formTarget]: id });
              setNewSection(null);
            }}>
            <label className="block text-sm font-semibold">Section name
              <input required className={builderInput} value={newSection} onChange={(event) => setNewSection(event.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className={builderButton} onClick={() => setNewSection(null)}>Cancel</button>
              <button type="submit" className={builderPrimary}>Add Section</button>
            </div>
          </form>
        </div>
      )}

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-label="Reset Form Defaults" className="w-full max-w-md space-y-3 rounded-lg bg-white p-5">
            <h2 className="font-semibold text-blue-950">Restore the default form fields?</h2>
            <p className="text-sm text-slate-600">This replaces the draft for both forms. Saved farmer and crop records are kept.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={builderButton} onClick={() => setResetOpen(false)}>Cancel</button>
              <button type="button" className={builderPrimary} onClick={reset}>Reset Draft</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
