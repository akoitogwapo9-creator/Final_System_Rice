import { useEffect, useMemo, useState } from 'react';
import { farmLabel, farmerKey } from '../data/officeRegistry';
import type { FarmParcel } from '../types';
import { mapFarmerRowToParcel, supabaseClient } from '../utils/supabaseClient';

export function useFarmerParcels(farmer: FarmParcel | undefined, available: FarmParcel[], enabled = true) {
  const key = farmer ? farmerKey(farmer) : '';
  const groupId = farmer?.farmerGroupId || key;
  const reference = farmer?.swineNameOrId || farmer?.rsbsa_no || '';
  const [result, setResult] = useState<{ key: string; farms: FarmParcel[]; error: boolean }>();

  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    setResult(undefined);
    const load = async (column: string, value: string) => {
      const farms: FarmParcel[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabaseClient.from('farmers').select('*').eq(column, value)
          .order('id').range(offset, offset + pageSize - 1).abortSignal(controller.signal);
        if (error) throw error;
        farms.push(...data.map(mapFarmerRowToParcel));
        if (data.length < pageSize) return farms;
      }
    };
    const queries = [load('farmer_group_id', groupId)];
    if (reference && reference.toUpperCase() !== 'NO RSBSA') queries.push(load('rsbsa_number', reference));
    void Promise.allSettled(queries).then(responses => {
      if (controller.signal.aborted) return;
      setResult({
        key,
        farms: responses.flatMap(response => response.status === 'fulfilled' ? response.value : []),
        error: responses.some(response => response.status === 'rejected')
      });
    });
    return () => controller.abort();
  }, [enabled, key, groupId, reference]);

  const farms = useMemo(() => {
    if (!key) return [];
    const cached = available.filter(parcel => farmerKey(parcel) === key);
    if (result?.key !== key) return cached;
    const index = new Map(cached.map(parcel => [parcel.tagNumber, parcel]));
    for (const parcel of result.farms) {
      const local = index.get(parcel.tagNumber);
      if (!local?.isPendingSync && !local?.is_pending_sync) index.set(parcel.tagNumber, parcel);
    }
    return [...index.values()].filter(parcel => !parcel.isArchived && !parcel.is_archived)
      .sort((a, b) => farmLabel(a).localeCompare(farmLabel(b), undefined, { numeric: true }));
  }, [available, key, result]);

  return { farms, loading: enabled && Boolean(key) && result?.key !== key, cached: result?.key === key && result.error };
}
