import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// In-app confirm / prompt sheets and toasts, instead of the browser's own dialogs.
const UiCtx = createContext(null);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [value, setValue] = useState('');
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const confirm = useCallback((o) => new Promise((resolve) => setDlg({ kind: 'confirm', ...o, resolve })), []);
  const prompt = useCallback((o) => new Promise((resolve) => { setValue(o.value || ''); setDlg({ kind: 'prompt', ...o, resolve }); }), []);
  const notify = useCallback((text) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const close = (result) => { dlg?.resolve(result); setDlg(null); };
  const cancel = () => close(dlg?.kind === 'prompt' ? null : false);

  useEffect(() => {
    if (!dlg) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <UiCtx.Provider value={{ confirm, prompt, notify }}>
      {children}
      {dlg && (
        <div className="overlay" onClick={cancel}>
          <form
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={dlg.title}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); close(dlg.kind === 'prompt' ? value.trim() || null : true); }}
          >
            <span className="sheet-grip" />
            <span className="display" style={{ fontSize: 20 }}>{dlg.title}</span>
            {dlg.message && <span className="small muted" style={{ lineHeight: 1.45 }}>{dlg.message}</span>}
            {dlg.kind === 'prompt' && <input className="input" autoFocus aria-label={dlg.title} value={value} onChange={(e) => setValue(e.target.value)} />}
            <div className="grid2">
              <button type="button" className="btn" style={{ borderRadius: 14, height: 50 }} onClick={cancel}>{dlg.cancel || 'Annuler'}</button>
              <button className={`btn ${dlg.danger ? 'danger' : 'primary'}`} style={{ borderRadius: 14, height: 50 }}>{dlg.ok || 'OK'}</button>
            </div>
          </form>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </UiCtx.Provider>
  );
}
