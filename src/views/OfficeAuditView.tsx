import { useEffect, useState } from 'react';
import { supabaseClient } from '../utils/supabaseClient';

interface AuditEntry {
  id: number;
  recorded_at: string;
  actor_name: string;
  target_table: string;
  target_id: string;
  action: string;
}

const pageSize = 50;

export function OfficeAuditView() {
  const [page, setPage] = useState(0);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void (async () => {
      const { data, error } = await supabaseClient.from('registry_activity').select('id, recorded_at, actor_name, target_table, target_id, action')
        .order('id', { ascending: false }).range(page * pageSize, (page + 1) * pageSize);
      if (!active) return;
      if (error) setError(error.message);
      setEntries(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [page]);

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="mb-4 text-lg font-bold">Activity audit log</h2>
    {error && <p role="alert" className="mb-3 text-sm text-red-800">{error}</p>}
    {loading ? <p role="status">Loading activity…</p> : entries.length === 0 ? <p>No activity recorded.</p> :
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-100"><tr>{['Time', 'Staff member', 'Module', 'Record', 'Action'].map(label =>
          <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{entries.slice(0, pageSize).map(entry => <tr key={entry.id} className="border-b border-slate-200">
          <td className="p-2">{new Date(entry.recorded_at).toLocaleString()}</td><td className="p-2">{entry.actor_name}</td>
          <td className="p-2">{entry.target_table.replaceAll('_', ' ')}</td><td className="p-2">{entry.target_id}</td>
          <td className="p-2">{entry.action}</td>
        </tr>)}</tbody>
      </table></div>}
    <div className="mt-4 flex items-center gap-4 text-sm">
      <button type="button" className="font-semibold text-emerald-800 disabled:opacity-50" disabled={!page || loading}
        onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page + 1}</span>
      <button type="button" className="font-semibold text-emerald-800 disabled:opacity-50" disabled={entries.length <= pageSize || loading}
        onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </section>;
}
