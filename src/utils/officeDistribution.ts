import type { User } from '../types';
import { supabaseClient } from './supabaseClient';

export interface StockItem {
  item: string;
  category: 'Seed' | 'Fertilizer';
  unit: 'kg' | 'bag' | 'pack' | 'L';
  quantity: number;
}

export interface DistributionDraft extends StockItem {
  id: string;
  entry_type: 'Request' | 'Release' | 'Restock';
  parcel_id: string | null;
  season: string;
  acknowledgment: string;
}

export interface DistributionEntry extends DistributionDraft {
  farm_label: string | null;
  farmer_name: string | null;
  barangay: string | null;
  recorded_at: string;
  recorded_by: string;
}

export async function loadDistribution(releasesOnly = false, category?: StockItem['category']): Promise<DistributionEntry[]> {
  const entries: DistributionEntry[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    let query = supabaseClient.from('registry_distribution').select('*');
    if (releasesOnly) query = query.eq('entry_type', 'Release');
    if (category) query = query.eq('category', category);
    const { data, error } = await query.order('recorded_at', { ascending: false })
      .order('id').range(offset, offset + size - 1);
    if (error) throw error;
    entries.push(...data);
    if (data.length < size) return entries;
  }
}

export const DISTRIBUTION_QUEUE_EVENT = 'rice-distribution-queue-updated';

export function distributionQueueKey(user: User | null) {
  return user ? `rice-office-distribution:${user.id || user.username}` : '';
}

const distributionSyncs = new Map<string, Promise<string>>();

export function syncDistributionQueue(key: string): Promise<string> {
  if (!key || !navigator.onLine) return Promise.resolve('');
  const active = distributionSyncs.get(key);
  if (active) return active;
  const sync = (async () => {
    let failure = '';
    for (const entry of readDistributionQueue(key)) {
      try {
        await submitDistribution(entry);
        localStorage.setItem(key, JSON.stringify(readDistributionQueue(key).filter(item => item.id !== entry.id)));
      } catch (error) {
        failure = error?.message || 'A distribution entry remains queued.';
      }
    }
    return failure;
  })().finally(() => {
    distributionSyncs.delete(key);
    window.dispatchEvent(new CustomEvent(DISTRIBUTION_QUEUE_EVENT, { detail: key }));
  });
  distributionSyncs.set(key, sync);
  return sync;
}

export function readDistributionQueue(key: string): DistributionDraft[] {
  if (!key) return [];
  try {
    const queue = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

export async function submitDistribution(entry: DistributionDraft) {
  const { error } = await supabaseClient.from('registry_distribution').insert(entry);
  if (error?.code === '23505') {
    const existing = await supabaseClient.from('registry_distribution').select('id').eq('id', entry.id).maybeSingle();
    if (existing.data) return;
  }
  if (error) throw error;
}

const officeHeader = [
  'Republic of the Philippines',
  'Province of Southern Leyte',
  'Municipality of Silago',
  'Office of the Municipal Agriculturist (DA-MAO)'
];

type Cells = (string | number)[][];
export interface OfficeDocument {
  title: string;
  sections: { title: string; rows: Cells }[];
  signatories: string[];
}

export function documentRows(document: OfficeDocument): Cells {
  return [...officeHeader.map(line => [line]), [document.title], [],
    ...document.sections.flatMap(section => [[section.title], ...section.rows, []]),
    document.signatories];
}

export function printOfficeDocument(report: OfficeDocument) {
  const frame = document.createElement('iframe');
  frame.title = report.title;
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.append(frame);
  const printDocument = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDocument || !printWindow) {
    frame.remove();
    throw new Error('The print window could not be opened.');
  }
  const element = (tag: string, value?: string | number) => {
    const node = printDocument.createElement(tag);
    if (value !== undefined) node.textContent = String(value);
    return node;
  };
  printDocument.title = report.title;
  const style = element('style', `
    @page { size: A4; margin: 15mm; }
    body { font: 11pt Arial, sans-serif; color: #111; }
    header { text-align: center; line-height: 1.4; }
    h1 { font-size: 16pt; margin: 18px 0; }
    h2 { font-size: 12pt; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { border: 1px solid #888; padding: 5px; text-align: left; overflow-wrap: anywhere; }
    tr { break-inside: avoid; }
    thead { display: table-header-group; }
    footer { margin-top: 54px; display: flex; gap: 24px; break-inside: avoid; }
    footer div { flex: 1; border-top: 1px solid #555; padding-top: 6px; }
  `);
  printDocument.head.append(style);
  const header = element('header');
  header.append(...officeHeader.map(line => element('div', line)), element('h1', report.title));
  printDocument.body.append(header);
  for (const section of report.sections) {
    const table = element('table');
    const head = element('thead');
    const body = element('tbody');
    section.rows.forEach((row, index) => {
      const tr = element('tr');
      tr.append(...row.map(cell => element(index === 0 ? 'th' : 'td', cell)));
      (index === 0 ? head : body).append(tr);
    });
    table.append(head, body);
    printDocument.body.append(element('h2', section.title), table);
  }
  const footer = element('footer');
  footer.append(...report.signatories.map(signatory => element('div', signatory)));
  printDocument.body.append(footer);
  printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  printWindow.focus();
  printWindow.print();
}
