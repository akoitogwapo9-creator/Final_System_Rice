import { useId, useMemo, useState } from 'react';
import { farmerKey, farmerReference, groupFarmerParcels } from '../data/officeRegistry';
import type { FarmParcel } from '../types';
import { OFFICE_INPUT_CLASS, OFFICE_LABEL_CLASS } from './OfficeFormPrimitives';

export function FarmerCombobox({ parcels, value, onChange }: {
  parcels: FarmParcel[];
  value: string;
  onChange: (key: string) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const farmers = useMemo(() => groupFarmerParcels(parcels), [parcels]);
  const selected = farmers.find(parcel => farmerKey(parcel) === value);
  const getLabel = (parcel: FarmParcel) => `${parcel.raiserName} · ${farmerReference(parcel) || parcel.tagNumber}`;
  const matches = farmers.filter(parcel => getLabel(parcel).toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);
  const select = (parcel: FarmParcel) => {
    onChange(farmerKey(parcel));
    setOpen(false);
    setQuery('');
  };

  return <div className="relative space-y-1">
    <label htmlFor={id} className={OFFICE_LABEL_CLASS}>Registered Farmer</label>
    <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? `${id}-options` : undefined}
      aria-activedescendant={open && matches[active] ? `${id}-option-${active}` : undefined}
      autoComplete="off" placeholder="Search Farmer Name or RSBSA Number..."
      value={open ? query : selected ? getLabel(selected) : ''} className={OFFICE_INPUT_CLASS}
      onFocus={() => { setOpen(true); setActive(0); }}
      onClick={() => { if (!open) setOpen(true); }}
      onBlur={() => { setOpen(false); setQuery(''); }}
      onChange={event => { setOpen(true); setQuery(event.target.value); setActive(0); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); setQuery(''); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          setActive(index => open ? Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))) : 0);
        }
        if (open && event.key === 'Enter') {
          event.preventDefault();
          if (matches[active]) select(matches[active]);
        }
      }} />
    {open && <ul role="listbox" id={`${id}-options`} aria-label="Registered farmers"
      className="absolute z-30 max-h-48 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
      {matches.length === 0 && <li className="p-2 text-xs text-slate-600">No matching farmers.</li>}
      {matches.map((parcel, index) => <li key={farmerKey(parcel)} id={`${id}-option-${index}`}
        ref={element => { if (index === active) element?.scrollIntoView?.({ block: 'nearest' }); }}
        role="option" aria-selected={index === active}
        className={`cursor-pointer px-3 py-2 text-xs hover:bg-emerald-50 ${index === active ? 'bg-emerald-50' : ''}`}
        onMouseDown={event => event.preventDefault()} onClick={() => select(parcel)}>{getLabel(parcel)}</li>)}
    </ul>}
  </div>;
}
