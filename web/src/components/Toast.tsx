import { ui, useUI } from '../lib/ui';

/**
 * The toast as a floating pill. Used above the tab bar when there is no mini-player and under the header while the
 * full-screen player is open; with a mini-player the toast is drawn inside it instead (MiniPlayer.tsx).
 */
export function ToastBubble({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  const { toast } = useUI();
  if (!toast) return null;
  return (
    <div key={toast.id} className={`pointer-events-none flex justify-center ${className}`} style={style} role="status" aria-live="polite">
      <div className={`animate-pop flex max-w-full ${toast.action ? 'pointer-events-auto' : ''} items-center gap-3 rounded-full bg-fg py-2 pl-4 pr-4 text-footnote font-medium text-black shadow-float`} data-toast>
        <span className="min-w-0 truncate">{toast.text}</span>
        {toast.action && (
          <button className="press -my-1 -mr-2 shrink-0 rounded-full bg-black/10 px-3 py-1 font-semibold" onClick={() => { toast.action!.run(); ui.dismissToast(); }}>{toast.action.label}</button>
        )}
      </div>
    </div>
  );
}
