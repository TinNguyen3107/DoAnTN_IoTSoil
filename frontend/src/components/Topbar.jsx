import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Bell, RefreshCw, ChevronRight, Check, CheckCheck, LogOut, Menu } from 'lucide-react';
import { Badge } from './UI.jsx';

export default function Topbar({
  breadcrumbs = ['Tổng quan'],
  onRefresh,
  isRefreshing = false,
  currentUser,
  onLogout,
  unreadCount = 0,
  alertsVersion = 0,
  onAlertsMutated,
  onOpenAlerts,
  onToggleMenu,
  menuOpen = false
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertError, setAlertError] = useState('');
  const notificationRef = useRef(null);

  // UC-12 Step 2, 3: nạp danh sách cảnh báo chưa xử lý
  const fetchRecentAlerts = async () => {
    try {
      setLoadingAlerts(true);
      setAlertError('');
      const res = await axios.get('/api/alerts?unreadOnly=true&limit=5');
      if (res.data?.success) {
        setRecentAlerts(res.data.data);
      } else {
        setAlertError('Không tải được danh sách cảnh báo.');
      }
    } catch (err) {
      setAlertError('Không tải được danh sách cảnh báo. Vui lòng thử lại.');
    } finally {
      setLoadingAlerts(false);
    }
  };

  useEffect(() => {
    if (showNotifications) {
      fetchRecentAlerts();
    }
  }, [alertsVersion]);

  // Đóng bảng thông báo khi bấm Escape hoặc nhấp ra ngoài
  useEffect(() => {
    if (!showNotifications) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowNotifications(false);
    };
    const handlePointerDown = (e) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [showNotifications]);

  const handleTogglePopover = () => {
    if (!showNotifications) fetchRecentAlerts();
    setShowNotifications(!showNotifications);
  };

  // UC-13 Step 1a: xác nhận toàn bộ cảnh báo
  const handleResolveAll = async () => {
    try {
      await axios.patch('/api/alerts/resolve-all');
      setRecentAlerts([]);
      onAlertsMutated?.();
    } catch (err) {
      setAlertError('Chưa xác nhận được toàn bộ cảnh báo. Vui lòng thử lại.');
    }
  };

  // UC-13 Step 1: xác nhận từng cảnh báo
  const handleResolveOne = async (alertId) => {
    try {
      await axios.patch(`/api/alerts/${alertId}/resolve`, {
        actionTaken: 'Nông dân đã xử lý qua thanh thông báo'
      });
      setRecentAlerts(prev => prev.filter(a => a.id !== alertId));
      onAlertsMutated?.();
    } catch (err) {
      setAlertError('Chưa xác nhận được cảnh báo này. Vui lòng thử lại.');
    }
  };

  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="topbar">
      <div className="breadcrumbs">
        <button type="button" className="icon-button mobile-menu-button" onClick={onToggleMenu} aria-label="Mở menu điều hướng" aria-expanded={menuOpen}>
          <Menu size={20} />
        </button>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <ChevronRight size={14} aria-hidden="true" />}
            <span className={idx === breadcrumbs.length - 1 ? 'font-medium' : ''}>{crumb}</span>
          </React.Fragment>
        ))}
      </div>

      <div className="topbar-actions">
        <span className="topbar-date muted">{today}</span>

        {onRefresh && (
          <button type="button" className="icon-button" onClick={onRefresh} disabled={isRefreshing} title="Tải lại danh sách trạm và số cảnh báo" aria-label="Tải lại dữ liệu">
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}

        <div className="relative" ref={notificationRef}>
          <button type="button" className="icon-button" onClick={handleTogglePopover} aria-label="Thông báo cảnh báo vượt ngưỡng" aria-expanded={showNotifications}>
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--clay)] text-white text-[10px] font-semibold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="notification-panel" role="dialog" aria-label="Cảnh báo chưa xử lý">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--line)]">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg">Cảnh báo vượt ngưỡng</h2>
                  {unreadCount > 0 && <Badge tone="danger">{unreadCount}</Badge>}
                </div>
                {unreadCount > 0 && (
                  <button type="button" className="text-link" onClick={handleResolveAll} title="Xác nhận toàn bộ cảnh báo">
                    <CheckCheck size={15} />Đọc tất cả
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto px-4 py-1">
                {loadingAlerts ? (
                  <p className="muted text-xs py-8 text-center">Đang tải danh sách cảnh báo...</p>
                ) : alertError ? (
                  <p className="notice notice-error my-3" role="alert">{alertError}</p>
                ) : recentAlerts.length === 0 ? (
                  <div className="py-9 text-center">
                    <Check size={22} className="mx-auto text-[var(--green)]" />
                    <p className="mt-2 text-sm">Không còn cảnh báo chưa xử lý</p>
                    <p className="muted text-xs mt-1 max-w-[260px] mx-auto leading-relaxed">
                      Danh sách này chỉ phản ánh các cảnh báo đã được hệ thống ghi nhận, không phải kết luận rằng đất đang an toàn.
                    </p>
                  </div>
                ) : (
                  recentAlerts.map(alert => (
                    <article key={alert.id} className="notification-item">
                      <div className="flex items-center justify-between gap-3">
                        <Badge tone={alert.level === 'danger' ? 'danger' : 'warning'}>
                          {alert.level === 'danger' ? 'Nguy hiểm' : 'Cảnh báo'}
                        </Badge>
                        <span className="muted text-xs tabular-nums">
                          {new Date(alert.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">
                        <strong>{alert.parameterName}</strong>{' '}
                        <span className="tabular-nums">{alert.value} {alert.unit}</span>
                        <span className="muted"> · ngưỡng {alert.limitValue} {alert.unit}</span>
                      </p>
                      <p className="muted text-xs mt-1 leading-relaxed">{alert.diagnosticMessage}</p>
                      <div className="flex items-center justify-between gap-3 mt-2">
                        <span className="muted text-xs truncate max-w-[180px]">{alert.deviceName}</span>
                        <button type="button" className="text-link" onClick={() => handleResolveOne(alert.id)}>
                          <Check size={14} />Đã xử lý
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="px-4 py-3 border-t border-[var(--line)] text-center">
                <button type="button" className="text-link" onClick={() => { setShowNotifications(false); onOpenAlerts?.(); }}>
                  Xem tất cả cảnh báo<ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pl-3 border-l border-[var(--line)]">
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-xs font-medium">{currentUser?.fullName}</p>
            <p className="muted text-[11px]">{currentUser?.role === 'admin' ? 'Quản trị viên' : 'Nông dân'}</p>
          </div>
          <button type="button" className="icon-button" onClick={onLogout} title="Đăng xuất" aria-label="Đăng xuất">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
