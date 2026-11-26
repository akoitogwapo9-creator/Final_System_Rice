import { ArrowLeft } from 'lucide-react';
import { LegalDecreesView } from './AdminManagementViews';

export const PUBLIC_LAW_REPOSITORY_PATH = '/asf_ordinance';

export function PublicLawRepositoryPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <a href="/#legal-decrees-section" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            Back to Silago Rice Registry
          </a>
          <span className="text-xs font-medium text-slate-600">Public ordinance library</span>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6">
        <LegalDecreesView readOnly />
      </main>
    </div>
  );
}
