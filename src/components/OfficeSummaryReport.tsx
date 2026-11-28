import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { OFFICIAL_15_BARANGAYS, getDisplayBarangay } from '../data/barangays';
import { farmerKey } from '../data/officeRegistry';
import { documentRows, loadDistribution, printOfficeDocument } from '../utils/officeDistribution';
import type { OfficeDocument } from '../utils/officeDistribution';

export function OfficeSummaryReport() {
  const { currentUser, parcels } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (currentUser?.role !== 'Central Admin') return null;

  async function exportReport(format: 'print' | 'xlsx' | 'csv') {
    setBusy(true);
    setError('');
    try {
      const log = await loadDistribution(true);
      const active = parcels.filter(parcel => !parcel.isArchived && !parcel.isPendingSync);
      function summarize(label: string, records: typeof active) {
        let total = 0;
        let irrigated = 0;
        let rainfed = 0;
        for (const parcel of records) {
          const area = Number(parcel.areaHa ?? parcel.weightKg) || 0;
          const ecosystem = (parcel.ecosystem || parcel.purpose || '').trim().toLowerCase();
          total += area;
          if (/^irrigated\b/.test(ecosystem)) irrigated += area;
          if (/^rainfed\b/.test(ecosystem)) rainfed += area;
        }
        return [label, new Set(records.map(farmerKey)).size, records.length,
          ...[irrigated, rainfed, total - irrigated - rainfed, total].map(value => Number(value.toFixed(3)))];
      }
      const barangays = OFFICIAL_15_BARANGAYS.map(name => summarize(name,
        active.filter(parcel => getDisplayBarangay(parcel.barangay) === name)));
      const unresolved = active.filter(parcel => !OFFICIAL_15_BARANGAYS.some(name => name === getDisplayBarangay(parcel.barangay)));
      if (unresolved.length) barangays.push(summarize('Location pending review', unresolved));
      const report: OfficeDocument = {
        title: 'Municipal Rice Registry and Input Distribution Summary',
        sections: [
          { title: `Registered rice area · ${new Date().toLocaleDateString('en-PH')}`, rows: [
            ['Barangay', 'Farmers', 'Parcels', 'Irrigated (ha)', 'Rainfed (ha)', 'Other (ha)', 'Total (ha)'],
            ...barangays, summarize('Municipal total', active)
          ] },
          { title: 'Seed and fertilizer releases', rows: [
            ['Date', 'Barangay', 'Farmer', 'Farm', 'Parcel ID', 'Season', 'Category', 'Item / Variety', 'Quantity', 'Unit', 'Acknowledgment', 'Recorded by'],
            ...log.map(item => [new Date(item.recorded_at).toLocaleDateString('en-PH'), item.barangay || '',
              item.farmer_name || '', item.farm_label || '', item.parcel_id || '', item.season, item.category,
              item.item, item.quantity, item.unit, item.acknowledgment || '', item.recorded_by])
          ] }
        ],
        signatories: [`Prepared by · ${currentUser.name}`, 'Reviewed by', 'Approved by · Municipal Agriculturist']
      };
      if (format === 'print') {
        printOfficeDocument(report);
        return;
      }
      const rows = documentRows(report);
      const sanitized = format === 'csv' ? rows.map(row => row.map(cell =>
        typeof cell === 'string' && /^[\s]*[=+@-]/.test(cell) ? "'" + cell : cell)) : rows;
      const sheet = XLSX.utils.aoa_to_sheet(sanitized);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Municipal summary');
      XLSX.writeFile(workbook, `Silago-MAO-Rice-Summary.${format}`, { bookType: format });
    } catch (error) {
      setError(error?.message || 'Unable to load or export the municipal summary.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900">Municipal registry and distribution summary</h2>
        <p className="text-sm text-slate-600">Registered rice area and input releases across Silago’s 15 barangays.</p></div>
      <div className="flex flex-wrap gap-2">
        {([['print', 'Print / Save PDF'], ['xlsx', 'Excel'], ['csv', 'CSV']] as const).map(([format, label]) =>
          <button key={format} type="button" disabled={busy} onClick={() => void exportReport(format)}
            className="rounded-lg border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50">{label}</button>
        )}
      </div>
    </div>
    {busy && <p role="status" className="mt-2 text-sm">Preparing report…</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
  </section>;
}
