import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { FallbackCover } from '../components/Art';
import { ChevronLeft, SearchIcon, CloseIcon } from '../components/Icons';
import { ImportButton } from '../components/ImportButton';

/** Top-of-screen title row. Respects the Dynamic Island / status bar via --sat. */
export function ScreenHeader({ title, eyebrow, actions, back }: { title: string; eyebrow?: string; actions?: ReactNode; back?: string }) {
  const nav = useNavigate();
  return (
    <header className="flex items-end justify-between gap-3 px-gutter pb-3" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)' }}>
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <button className="press -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-s2" aria-label="Back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}>
            <ChevronLeft size={22} />
          </button>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow mb-0.5 truncate">{eyebrow}</div>}
          <h1 className="line-clamp-2 break-words text-title-lg font-extrabold">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function RoundButton({ label, onClick, children, tone = 'surface' }: { label: string; onClick: () => void; children: ReactNode; tone?: 'surface' | 'accent' }) {
  return (
    <button className={`press flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone === 'accent' ? 'bg-accent text-black' : 'bg-s2 text-fg'}`} onClick={onClick} aria-label={label}>{children}</button>
  );
}

export function BackBar({ to, right }: { to: string; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="relative z-10 flex items-center justify-between px-gutter" style={{ paddingTop: 'calc(var(--sat) + 0.5rem)' }}>
      <button className="press flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm" aria-label="Back" onClick={() => (window.history.length > 1 ? nav(-1) : nav(to))}>
        <ChevronLeft size={24} />
      </button>
      {right}
    </div>
  );
}

/** Compact, intentional empty state: small cover tile, short copy, one button. No giant illustration. */
export function EmptyState({ title, body, showImport = true }: { title: string; body: string; showImport?: boolean }) {
  return (
    <div className="page-enter mx-gutter flex items-center gap-4 rounded-xl bg-s2 p-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg"><FallbackCover seed={title} /></div>
      <div className="min-w-0 flex-1">
        <h2 className="text-body-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-footnote text-fg-2">{body}</p>
        {showImport && <ImportButton className="mt-3" variant="compact" />}
      </div>
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-full bg-s2 px-3.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
      <SearchIcon size={18} className="shrink-0 text-fg-3" />
      <input
        value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && <button className="press shrink-0 text-fg-3" onClick={() => onChange('')} aria-label="Clear search"><CloseIcon size={18} /></button>}
    </label>
  );
}

export function Chip({ active, onClick, to, children, label }: { active?: boolean; onClick?: () => void; to?: string; children: ReactNode; label?: string }) {
  const cls = `press inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-footnote font-semibold ${active ? 'bg-fg text-black' : 'bg-s2 text-fg-2 ring-1 ring-line'}`;
  return to ? <Link to={to} className={cls} aria-current={active ? 'page' : undefined}>{children}</Link>
    : <button className={cls} onClick={onClick} aria-pressed={active} aria-label={label}>{children}</button>;
}
