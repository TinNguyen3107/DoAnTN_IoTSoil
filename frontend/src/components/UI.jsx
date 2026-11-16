import React, { useEffect, useRef } from 'react';
import { X, LoaderCircle, Sprout, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import FieldIllustration from './FieldIllustration.jsx';

export function PageHeader({ eyebrow, title, description, actions, illustration = false }) {
  return <div className="page-header">
    <div className="page-heading">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>
    {illustration && <FieldIllustration className="heading-landscape" />}
    {actions && <div className="page-actions">{actions}</div>}
  </div>;
}

export function Button({ children, variant = 'primary', busy = false, className = '', type = 'button', disabled, ...props }) {
  return <button type={type} className={`btn btn-${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} {...props}>{busy && <LoaderCircle size={16} className="animate-spin" />}{children}</button>;
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function Notice({ children, tone = 'info', className = '' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' || tone === 'warning' ? AlertCircle : Info;
  return <div className={`notice notice-${tone} ${className}`} role={tone === 'error' ? 'alert' : 'status'}><Icon size={18} /><div>{children}</div></div>;
}

export function EmptyState({ title = 'Chưa có dữ liệu', description, action, loading = false }) {
  return <div className="empty-state" role="status">{loading ? <LoaderCircle className="animate-spin" size={28} /> : <Sprout size={32} strokeWidth={1.25} />}<h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}

export function Field({ label, children, hint, htmlFor, className = '' }) {
  return <div className={`field ${className}`}><label htmlFor={htmlFor}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}

export function Drawer({ open, onClose, title, description, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  return <dialog ref={ref} className="drawer" aria-label={title} onCancel={onClose} onClick={event => { if (event.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose(); } }}>
    <div className="drawer-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" onClick={onClose} aria-label="Đóng bảng thao tác"><X size={20} /></button></div>
    <div className="drawer-body">{open && children}</div>
  </dialog>;
}
