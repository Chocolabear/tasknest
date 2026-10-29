import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, error }: { title: string; onClose: () => void; children: ReactNode; error?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="닫기" onClick={onClose}><X size={20} /></button></header>
    {children}
    {error && <p className="error-banner" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>{error}</p>}
  </dialog>;
}
