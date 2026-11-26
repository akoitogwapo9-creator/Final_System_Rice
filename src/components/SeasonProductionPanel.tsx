import React, { useMemo, useState } from 'react';
import { FarmParcel } from '../types';
import {
  ACTIVE_SEASON,
  getParcelSeasonOptions,
  getSeasonRecord,
  getShortSeasonName,
  hasActualProduction,
  seasonOrder
} from '../data/seasonalProduction';
import { OfficePanel } from './OfficeFormPrimitives';

interface SeasonProductionPanelProps {
  parcels: FarmParcel[];
  onSelectParcel: (parcel: FarmParcel) => void;
}

export function SeasonProductionPanel({ parcels, onSelectParcel }: SeasonProductionPanelProps) {
  const [selection, setSelection] = useState('');
  const seasons = useMemo(() => getParcelSeasonOptions(parcels), [parcels]);
  const lastSeason = seasons.find((season) => seasonOrder(season) < seasonOrder(ACTIVE_SEASON)) || ACTIVE_SEASON;
  const season = seasons.includes(selection) ? selection : lastSeason;
  const rows = parcels.flatMap((parcel) => {
    const record = getSeasonRecord(parcel, season);
    if (!record) return [];
    const reference = (parcel.rsbsa_no || parcel.swineNameOrId || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const farmer = reference && !['NORSBSA', 'NA', 'NONE'].includes(reference)
      ? reference
      : `${parcel.raiserName.trim().toLowerCase()}|${parcel.contactNumber || parcel.tagNumber}`;
    return [{ parcel, record, farmer }];
  });

  return (
    <OfficePanel
      title="Seasonal Production"
      rightContent={
        <label className="flex items-center gap-2 text-xs font-semibold">
          Season
          <select
            value={season}
            onChange={(event) => setSelection(event.target.value)}
            className="rounded border border-gov-line bg-white px-2 py-1.5"
          >
            {seasons.map((option) => (
              <option key={option} value={option}>
                {option === lastSeason ? 'Last Season · ' : ''}{getShortSeasonName(option)}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {(['HYBRID', 'INBRED'] as const).map((type) => {
          const group = rows.filter(({ record }) => record.seedType === type);
          const harvested = group.filter(({ record }) => hasActualProduction(record));
          const volume = harvested.reduce((sum, { record }) => sum + record.actualProductionVolumeMt, 0);
          const area = harvested.reduce((sum, { parcel, record }) =>
            sum + (record.harvestedAreaHa ?? parcel.areaHa ?? parcel.weightKg ?? 0), 0);
          const metrics = [
            ['No. of Farmers', new Set(group.map(({ farmer }) => farmer)).size],
            ['Average Volume of Production per Hectare (ha)', area > 0 ? `${(volume / area).toFixed(2)} MT/ha` : '—'],
            ['Volume of Production (MT)', volume.toFixed(2)]
          ];

          return (
            <section key={type} className="rounded-lg border border-gov-line bg-white p-4">
              <h3 className="mb-3 font-semibold text-gov-ink">
                {type === 'HYBRID' ? 'Hybrid Production' : 'Inbred Production'}
              </h3>
              <dl className="grid grid-cols-3 gap-2">
                {metrics.map(([label, value]) => (
                  <div key={label} className="rounded bg-gov-canvas p-2">
                    <dt className="text-xs text-gov-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums text-gov-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {group.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer font-semibold text-gov-green">Farmer production records</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gov-line">
                          <th scope="col" className="p-2">Farmer / Parcel</th>
                          <th scope="col" className="p-2">Seed Variety</th>
                          <th scope="col" className="p-2 text-right">Production (MT)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.map(({ parcel, record }) => (
                          <tr key={parcel.tagNumber} className="border-b border-gov-line">
                            <td className="p-2">
                              <button type="button" className="text-left font-semibold text-gov-green hover:underline" onClick={() => onSelectParcel(parcel)}>
                                {parcel.raiserName}
                              </button>
                              <span className="block text-gov-muted">{parcel.tagNumber}</span>
                            </td>
                            <td className="p-2">{record.seedVariety}</td>
                            <td className="p-2 text-right tabular-nums">
                              {hasActualProduction(record) ? record.actualProductionVolumeMt.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </OfficePanel>
  );
}
