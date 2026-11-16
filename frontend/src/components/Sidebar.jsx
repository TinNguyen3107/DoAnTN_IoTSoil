import React from 'react';
import BrandLogo from './BrandLogo.jsx';
import { House, Activity, Radio, SlidersHorizontal, ChartNoAxesCombined, NotebookPen, Sprout, Users, Settings2, ShieldCheck, UserRound, LogOut, Bell, X } from 'lucide-react';

export default function Sidebar({ activeTab, onSelectTab, counts = {}, currentUser, onLogout, open = false, onClose }) {
  const isAdmin = currentUser?.role === 'admin';
  const sections = isAdmin ? [
    { title: 'Vận hành', items: [
      ['dashboard', 'Tổng quan hệ thống', House],
      ['telemetry', 'Số đo hiện tại', Activity],
      ['devices', 'Thiết bị', Radio, counts.devices],
      ['analytics', 'Lịch sử dữ liệu', ChartNoAxesCombined],
      ['alerts', 'Cảnh báo', Bell, counts.alerts],
    ] },
    { title: 'Canh tác', items: [
      ['field_logs', 'Nhật ký', NotebookPen],
      ['recommendations', 'Tư vấn', Sprout],
    ] },
    { title: 'Quản trị', items: [
      ['users', 'Tài khoản', Users],
      ['thresholds', 'Ngưỡng cảnh báo', SlidersHorizontal],
      ['settings', 'Hệ số tính toán', Settings2],
    ] },
  ] : [{ title: 'Vườn của tôi', items: [
    ['telemetry', 'Tổng quan', House],
    ['devices', 'Thiết bị', Radio, counts.devices],
    ['analytics', 'Lịch sử', ChartNoAxesCombined],
    ['alerts', 'Cảnh báo', Bell, counts.alerts],
    ['field_logs', 'Nhật ký', NotebookPen],
    ['recommendations', 'Tư vấn', Sprout],
  ] }];

  return <>
    {open && <button className="sidebar-backdrop" onClick={onClose} aria-label="Đóng thanh điều hướng" />}
    <aside id="main-navigation" className={`app-sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-brand"><BrandLogo size={29} /><button className="icon-button sidebar-close" onClick={onClose} aria-label="Đóng menu"><X size={19} /></button></div>
      <nav className="sidebar-nav" aria-label={isAdmin ? 'Điều hướng quản trị viên' : 'Điều hướng nông dân'}>
        {sections.map(section => <div className="nav-section" key={section.title}><div className="nav-section-title">{section.title}</div>
          {section.items.map(([id, label, Icon, count]) => <button key={id} type="button" className={`nav-item ${activeTab === id ? 'active' : ''}`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => { onSelectTab(id); onClose?.(); }}><Icon size={19} strokeWidth={1.5} /><span>{label}</span>{count > 0 && <span className={`nav-count ${id === 'alerts' ? 'alert-count' : ''}`}>{count}</span>}</button>)}
        </div>)}
      </nav>
      <div className="sidebar-user">{isAdmin ? <ShieldCheck size={23} strokeWidth={1.4} /> : <UserRound size={23} strokeWidth={1.4} />}<div className="min-w-0 flex-1"><div className="user-name">{currentUser?.fullName || 'Người dùng'}</div><div className="user-role">{isAdmin ? 'Quản trị viên' : 'Nông dân'}</div></div><button className="icon-button" onClick={onLogout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={18} /></button></div>
    </aside>
  </>;
}
