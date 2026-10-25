import type { ReactNode } from 'react';

type P = { className?: string; size?: number };
const base = (children: ReactNode, { className, size = 24 }: P, fill = 'currentColor') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} className={className} aria-hidden="true">{children}</svg>
);
const stroke = (children: ReactNode, { className, size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export const PlayIcon = (p: P) => base(<path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z" />, p);
export const PauseIcon = (p: P) => base(<><rect x="6" y="4.5" width="4.2" height="15" rx="1.4" /><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.4" /></>, p);
export const NextIcon = (p: P) => base(<><path d="M5 5.6v12.8a1 1 0 0 0 1.55.83l9.3-6.4a1 1 0 0 0 0-1.66l-9.3-6.4A1 1 0 0 0 5 5.6z" /><rect x="17" y="5" width="2.6" height="14" rx="1.1" /></>, p);
export const PrevIcon = (p: P) => base(<><path d="M19 5.6v12.8a1 1 0 0 1-1.55.83l-9.3-6.4a1 1 0 0 1 0-1.66l9.3-6.4A1 1 0 0 1 19 5.6z" /><rect x="4.4" y="5" width="2.6" height="14" rx="1.1" /></>, p);
export const ShuffleIcon = (p: P) => stroke(<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>, p);
export const RepeatIcon = (p: P) => stroke(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>, p);
export const RepeatOneIcon = (p: P) => stroke(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /><path d="M11 10h1v4" /></>, p);
export const HeartIcon = ({ filled, ...p }: P & { filled?: boolean }) =>
  <svg width={p.size ?? 24} height={p.size ?? 24} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className} aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
export const HomeIcon = (p: P) => stroke(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></>, p);
export const SearchIcon = (p: P) => stroke(<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>, p);
export const LibraryIcon = (p: P) => stroke(<><path d="M4 4v16" /><path d="M9 4v16" /><path d="m14 5 5 14" /><path d="m14 5 3.5-1" /></>, p);
export const SettingsIcon = (p: P) => stroke(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>, p);
export const PlusIcon = (p: P) => stroke(<><path d="M12 5v14" /><path d="M5 12h14" /></>, p);
export const ChevronDown = (p: P) => stroke(<path d="m6 9 6 6 6-6" />, p);
export const ChevronRight = (p: P) => stroke(<path d="m9 6 6 6-6 6" />, p);
export const ChevronLeft = (p: P) => stroke(<path d="m15 6-6 6 6 6" />, p);
export const MoreIcon = (p: P) => base(<><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></>, p);
export const QueueIcon = (p: P) => stroke(<><path d="M3 6h13" /><path d="M3 12h13" /><path d="M3 18h7" /><path d="m17 15 4 3-4 3z" fill="currentColor" /></>, p);
export const TrashIcon = (p: P) => stroke(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m6 6 1 14h10l1-14" /></>, p);
export const NoteIcon = (p: P) => base(<path d="M9 3v11.3A3.5 3.5 0 1 0 11 17.5V7.6l8-1.8V12a3.5 3.5 0 1 0 2 3.2V3.9L9 3z" />, p);
export const CloseIcon = (p: P) => stroke(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, p);
export const UpIcon = (p: P) => stroke(<path d="m6 15 6-6 6 6" />, p);
export const DownIcon = (p: P) => stroke(<path d="m6 9 6 6 6-6" />, p);
