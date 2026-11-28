import { useState } from 'react';
import type { FarmParcel } from '../types';
import { useApp } from '../context/AppContext';
import { farmLabel, VERIFICATION_STATUSES } from '../data/officeRegistry';
import { supabaseClient } from '../utils/supabaseClient';
import { OFFICE_SELECT_CLASS } from './OfficeFormPrimitives';

export function OfficeRegistryVerification({ parcel }: { parcel: FarmParcel }) {
  const { currentUser, fetchParcels, parcels } = useApp();
  const latest = parcels.find(item => item.tagNumber === parcel.tagNumber) || parcel;
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [drafts, setDrafts] = useState<Partial<Record<'farmer' | 'parcel', string>>>({});
  const isAdmin = currentUser?.role === 'Central Admin';

  async function verify(scope: 'farmer' | 'parcel', status: string) {
    setSaving(true);
    setFeedback('');
    try {
      const { error } = await supabaseClient.rpc('registry_set_verification', {
        parcel_id: parcel.tagNumber, verification_scope: scope, status
      });
      if (error) throw error;
      await fetchParcels();
      setDrafts(previous => ({ ...previous, [scope]: undefined }));
      setFeedback('Verification saved.');
    } catch (error) {
      setFeedback(error?.message || 'Unable to save verification.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-lg border border-slate-200 bg-white p-3">
    <h3 className="mb-2 text-sm font-bold">MAO verification · {farmLabel(parcel)}</h3>
    <div className="grid gap-3 sm:grid-cols-2">{(['farmer', 'parcel'] as const).map(scope => {
      const status = (scope === 'farmer' ? latest.farmerVerificationStatus : latest.parcelVerificationStatus) || VERIFICATION_STATUSES[0];
      const name = scope === 'farmer' ? latest.farmerVerifiedBy : latest.parcelVerifiedBy;
      const date = scope === 'farmer' ? latest.farmerVerifiedAt : latest.parcelVerifiedAt;
      const choice = drafts[scope] || status;
      return <div className="space-y-2" key={scope}>
        <p className="text-sm"><strong>{scope === 'farmer' ? 'Farmer' : 'Farm parcel'}</strong> · {status}</p>
        {name && date && <p className="text-xs text-slate-600">{name} · {new Date(date).toLocaleString()}</p>}
        {isAdmin && <div className="flex gap-2">
          <select aria-label={`${scope} verification status`} className={OFFICE_SELECT_CLASS} value={choice}
            onChange={event => setDrafts(previous => ({ ...previous, [scope]: event.target.value }))}>
            {VERIFICATION_STATUSES.map(option => <option key={option}>{option}</option>)}
          </select>
          <button className="rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white disabled:opacity-50"
            type="button" disabled={saving || latest.isPendingSync || choice === status}
            onClick={() => void verify(scope, choice)}>Save status</button>
        </div>}
      </div>;
    })}</div>
    {feedback && <p role="status" className="mt-2 text-xs text-slate-700">{feedback}</p>}
  </section>;
}
