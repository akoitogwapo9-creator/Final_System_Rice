import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { farmLabel, farmerKey, groupFarmerParcels } from '../data/officeRegistry';
import { isUserAuthorizedForBarangay } from '../data/barangays';
import { getParcelSeasonOptions } from '../data/seasonalProduction';
import { supabaseClient } from '../utils/supabaseClient';
import { OFFICE_INPUT_CLASS, OFFICE_SELECT_CLASS } from '../components/OfficeFormPrimitives';
import {
  DISTRIBUTION_QUEUE_EVENT, distributionQueueKey, loadDistribution, printOfficeDocument,
  readDistributionQueue, submitDistribution, syncDistributionQueue
} from '../utils/officeDistribution';
import type { DistributionDraft, DistributionEntry, StockItem } from '../utils/officeDistribution';

const card = 'rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm';
const action = 'rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50';

export function OfficeDistributionView({ onOpenCrops }: { onOpenCrops: () => void }) {
  const { parcels, currentUser } = useApp();
  const isAdmin = currentUser?.role === 'Central Admin';
  const queueKey = distributionQueueKey(currentUser);
  const [entryType, setEntryType] = useState<DistributionDraft['entry_type']>('Release');
  const [farmer, setFarmer] = useState('');
  const [parcelId, setParcelId] = useState('');
  const [log, setLog] = useState<DistributionEntry[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [queue, setQueue] = useState<DistributionDraft[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);
  const requestId = useRef<string | null>(null);
  const available = parcels.filter(p => !p.isArchived && isUserAuthorizedForBarangay(currentUser, p.barangay));
  const parcel = available.find(p => p.tagNumber === parcelId);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setError('');
    try {
      const failure = await syncDistributionQueue(queueKey);
      if (failure) setError(failure);
      setQueue(readDistributionQueue(queueKey));
      const [entries, inventory] = await Promise.all([
        loadDistribution(), supabaseClient.from('registry_stock').select('*').order('item')
      ]);
      setLog(entries);
      if (inventory.error) throw inventory.error;
      setStock(inventory.data);
      try { localStorage.setItem(queueKey + ':stock', JSON.stringify(inventory.data)); } catch {}
    } catch (error) {
      setError(error?.message || 'Unable to load the distribution ledger.');
    } finally {
      setLoading(false);
      syncing.current = false;
    }
  }, [queueKey]);

  useEffect(() => {
    const cached = localStorage.getItem(queueKey + ':stock');
    if (cached) { try { setStock(JSON.parse(cached)); } catch {} }
    setQueue(readDistributionQueue(queueKey));
    void sync();
    const onQueueChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== queueKey) return;
      setQueue(readDistributionQueue(queueKey));
      if (!syncing.current) {
        void Promise.all([loadDistribution(), supabaseClient.from('registry_stock').select('*').order('item')])
          .then(([entries, inventory]) => {
            setLog(entries);
            if (inventory.data) setStock(inventory.data);
          }).catch(error => setError(error?.message || 'Unable to refresh the distribution log.'));
      }
    };
    window.addEventListener('online', sync);
    window.addEventListener(DISTRIBUTION_QUEUE_EVENT, onQueueChange);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener(DISTRIBUTION_QUEUE_EVENT, onQueueChange);
    };
  }, [queueKey, sync]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const stockItem = entryType === 'Release' ? stock.find(item => JSON.stringify([item.item, item.category, item.unit]) === data.get('stock')) : undefined;
    const entry: DistributionDraft = {
      id: requestId.current || crypto.randomUUID(), entry_type: entryType,
      parcel_id: entryType === 'Restock' ? null : parcelId,
      season: String(data.get('season') || '').trim(),
      acknowledgment: String(data.get('acknowledgment') || '').trim(),
      item: stockItem?.item || String(data.get('item') || '').trim(),
      category: stockItem?.category || data.get('category') as StockItem['category'],
      unit: stockItem?.unit || data.get('unit') as StockItem['unit'],
      quantity: Number(data.get('quantity'))
    };
    if (!entry.item || !Number.isFinite(entry.quantity) || entry.quantity <= 0 ||
        (entryType !== 'Restock' && (!parcel || !entry.season))) {
      setError('Complete the item, quantity, parcel, and season fields for this entry.');
      return;
    }
    requestId.current = entry.id;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (navigator.onLine) {
        try { await submitDistribution(entry); } catch (error) {
          if (error?.code && !String(error.code).startsWith('08')) throw error;
          localStorage.setItem(queueKey, JSON.stringify([...readDistributionQueue(queueKey), entry]));
        }
      } else {
        localStorage.setItem(queueKey, JSON.stringify([...readDistributionQueue(queueKey), entry]));
      }
      const pending = readDistributionQueue(queueKey);
      setQueue(pending);
      setStatus(pending.some(item => item.id === entry.id) ? 'Entry queued. Stock updates when it syncs.' : 'Entry recorded.');
      requestId.current = null;
      form.reset();
      setFarmer('');
      setParcelId('');
      if (navigator.onLine) await sync();
    } catch (error) {
      requestId.current = null;
      setError(error?.message || 'Unable to save the distribution entry.');
    } finally {
      setBusy(false);
    }
  };

  const receipt = (entry: DistributionEntry) => {
    try {
      printOfficeDocument({
        title: 'Farm Input Release Acknowledgment',
        sections: [{ title: 'Release details', rows: [
          ['Field', 'Details'], ['Receipt ID', entry.id], ['Date', new Date(entry.recorded_at).toLocaleString()],
          ['Farmer', entry.farmer_name || ''], ['Farm parcel', `${entry.farm_label} · ${entry.parcel_id}`],
          ['Barangay', entry.barangay || ''], ['Cropping season', entry.season],
          ['Input released', `${entry.item} · ${entry.quantity} ${entry.unit}`],
          ['Acknowledgment', entry.acknowledgment || ''], ['Recorded by', entry.recorded_by]
        ] }],
        signatories: ['Released by', 'Received by (signature over printed name)']
      });
    } catch (error) {
      setError(error?.message || 'Unable to print acknowledgment.');
    }
  };

  const visibleLog = log.filter(entry =>
    [entry.item, entry.farmer_name, entry.farm_label, entry.barangay, entry.season, entry.entry_type]
      .some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))
  );

  return <div className="space-y-5">
    <section className={card}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Input &amp; Seed Distribution</h2>
        <button className={action} type="button" onClick={onOpenCrops}>Record crop planting</button>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {status && <p role="status" className="mb-3 text-sm text-emerald-800">{status}</p>}
      {queue.length > 0 && <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">
        <p>{queue.length} pending distribution {queue.length === 1 ? 'entry' : 'entries'}.</p>
        <button type="button" className="font-semibold text-emerald-800" onClick={() => void sync()}>Retry sync</button>
      </div>}
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label>Transaction<select aria-label="Transaction" className={OFFICE_SELECT_CLASS} value={entryType}
          onChange={e => setEntryType(e.target.value as DistributionDraft['entry_type'])}>
          <option value="Release">Release inputs</option><option value="Request">Request inputs</option>
          {isAdmin && <option value="Restock">Receive municipal stock</option>}
        </select></label>
        {entryType !== 'Restock' && <>
          <label>Farmer<select aria-label="Farmer" required className={OFFICE_SELECT_CLASS} value={farmer} onChange={e => {
            setFarmer(e.target.value);
            setParcelId('');
          }}>
            <option value="">Select farmer</option>
            {groupFarmerParcels(available).map(p =>
              <option key={farmerKey(p)} value={farmerKey(p)}>{p.raiserName} · {p.swineNameOrId === 'NO RSBSA' ? p.tagNumber : p.swineNameOrId}</option>
            )}
          </select></label>
          <label>Select Farm<select aria-label="Select Farm" required disabled={!farmer} className={OFFICE_SELECT_CLASS} value={parcelId}
            onChange={e => setParcelId(e.target.value)}>
            <option value="">Select parcel</option>
            {available.filter(p => farmerKey(p) === farmer).map(p =>
              <option key={p.tagNumber} value={p.tagNumber}>{farmLabel(p)} · {p.barangay} · {p.tagNumber}</option>
            )}
          </select></label>
          <label>Cropping season<input aria-label="Cropping season" name="season" required list="distribution-seasons" className={OFFICE_INPUT_CLASS} />
            <datalist id="distribution-seasons">{getParcelSeasonOptions(parcel ? [parcel] : []).map(season =>
              <option key={season} value={season} />)}</datalist>
          </label>
        </>}
        {entryType === 'Release'
          ? <label>Stock item<select aria-label="Stock item" name="stock" required className={OFFICE_SELECT_CLASS}>
              <option value="">Select item</option>
              {stock.map(item =>
                <option key={`${item.category}/${item.item}/${item.unit}`} value={JSON.stringify([item.item, item.category, item.unit])} disabled={item.quantity <= 0}>
                  {item.item} · {item.category} · {item.quantity} {item.unit} remaining
                </option>)}
            </select></label>
          : <>
              <label>Item or variety<input name="item" required className={OFFICE_INPUT_CLASS} /></label>
              <label>Category<select name="category" className={OFFICE_SELECT_CLASS}><option>Seed</option><option>Fertilizer</option></select></label>
              <label>Unit<select name="unit" className={OFFICE_SELECT_CLASS}>{['kg','bag','pack','L'].map(unit => <option key={unit}>{unit}</option>)}</select></label>
            </>}
        <label>Quantity<input required name="quantity" type="number" min="0.001" step="any" className={OFFICE_INPUT_CLASS} /></label>
        {entryType === 'Release' && <label>Acknowledgment reference or recipient<input name="acknowledgment" className={OFFICE_INPUT_CLASS} /></label>}
        <div className="sm:col-span-2 lg:col-span-3"><button className={action} disabled={busy}>{busy ? 'Saving…' : 'Save transaction'}</button></div>
      </form>
    </section>
    <section className={card}>
      <h2 className="mb-3 text-lg font-bold">Municipal stock</h2>
      {loading ? <p role="status">Loading stock…</p> : stock.length === 0 ? <p>No stock items recorded.</p> :
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{stock.map(item => (
          <li key={`${item.category}/${item.item}/${item.unit}`} className="rounded-lg border border-slate-200 p-3 text-sm">
            <strong>{item.item}</strong><div>{item.category} · {item.quantity} {item.unit} remaining</div>
          </li>
        ))}</ul>}
    </section>
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Distribution log</h2>
        <input type="search" aria-label="Search distribution log" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search distribution log" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      {loading ? <p role="status">Loading transactions…</p> : visibleLog.length === 0 ? <p>No matching transactions.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-100"><tr>{['Date','Transaction','Farmer / Parcel','Barangay','Season','Input','Quantity','Acknowledgment'].map(label =>
            <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
          <tbody>{visibleLog.map(entry => <tr key={entry.id} className="border-b border-slate-200">
            <td className="p-2">{new Date(entry.recorded_at).toLocaleDateString()}</td><td className="p-2">{entry.entry_type}</td>
            <td className="p-2">{[entry.farmer_name, entry.farm_label].filter(Boolean).join(' · ') || 'Municipal stock'}</td>
            <td className="p-2">{entry.barangay}</td><td className="p-2">{entry.season}</td><td className="p-2">{entry.item}</td>
            <td className="p-2">{entry.quantity} {entry.unit}</td>
            <td className="p-2">{entry.entry_type === 'Release' && <button type="button" className="font-semibold text-emerald-800"
              onClick={() => receipt(entry)}>Print receipt</button>}</td>
          </tr>)}</tbody>
        </table></div>}
    </section>
  </div>;
}
