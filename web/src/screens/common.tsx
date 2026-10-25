import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ChevronLeft, NoteIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';
import { Art } from '../components/Art';
import type { Group } from '../lib/library';

export function Page({ title, back, action, children }: { title: string; back?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-safe">
      <header className="pt-safe flex items-center gap-1 pb-3">
        {back && <Link to={back} className="press -ml-2 p-2 text-violet-300" aria-label="Back"><ChevronLeft size={26} /></Link>}
        <h1 className="flex-1 truncate text-[30px] font-bold tracking-tight">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  );
}

export function EmptyState({ title, body, showImport = true }: { title: string; body: string; showImport?: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center animate-fade">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-700/50 to-ink-700 text-violet-200"><NoteIcon size={36} /></div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mb-6 mt-2 max-w-xs text-[15px] text-white/55">{body}</p>
      {showImport && <ImportButton />}
    </div>
  );
}

export function GroupGrid({ groups, base }: { groups: Group[]; base: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 pb-6">
      {groups.map((g) => (
        <Link key={g.key} to={`${base}/${encodeURIComponent(g.key)}`} className="press block min-w-0">
          <Art trackId={g.artTrackId} seed={g.name} className="w-full" rounded="rounded-2xl" />
          <div className="mt-2 truncate text-[15px] font-semibold">{g.name}</div>
          <div className="truncate text-[13px] text-white/50">{g.subtitle}</div>
        </Link>
      ))}
    </div>
  );
}
