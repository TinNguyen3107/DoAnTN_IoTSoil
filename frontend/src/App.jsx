import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AuthPage from './components/AuthPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import DashboardOverview from './components/DashboardOverview.jsx';
import DeviceManagement from './components/DeviceManagement.jsx';
import RealtimeMonitoring from './components/RealtimeMonitoring.jsx';
import ThresholdConfig from './components/ThresholdConfig.jsx';
import AlertManagement from './components/AlertManagement.jsx';
import AnalyticsHistory from './components/AnalyticsHistory.jsx';
import FieldLogs from './components/FieldLogs.jsx';
import Recommendations from './components/Recommendations.jsx';
import UserManagement from './components/UserManagement.jsx';
import SystemSettings from './components/SystemSettings.jsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [alertsVersion, setAlertsVersion] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Xử lý Đăng xuất
  const handleLogout = () => {
    localStorage.removeItem('agro_token');
    localStorage.removeItem('agro_user');
    delete axios.defaults.headers.common['Authorization'];
    setCurrentUser(null);
    setDevices([]);
    setPendingRequestsCount(0);
    setUnreadAlerts(0);
  };

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = event => { if (event.key === 'Escape') setMobileNavOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  // Đăng ký interceptor tự đăng xuất nếu JWT hết hạn / bị xóa / tài khoản bị tạm khóa
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      response => response,
      error => {
        const reqUrl = error.config?.url || '';
        const isAuthEndpoint = reqUrl.includes('/api/auth/login') || reqUrl.includes('/api/auth/register');
        const status = error.response?.status;
        const msg = error.response?.data?.message || '';
        const isLockedAccount = status === 403 && msg.includes('tạm khóa');

        if (!isAuthEndpoint && (status === 401 || isLockedAccount)) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  // Tải số lượng cảnh báo chưa xử lý
  const loadAlertsCount = async () => {
    try {
      const res = await axios.get('/api/alerts/unread-count');
      if (res.data?.success) {
        setUnreadAlerts(res.data.data.unreadCount || 0);
      }
    } catch (err) {
      // Bỏ qua lỗi
    }
  };

  const handleAlertsMutated = () => {
    loadAlertsCount();
    setAlertsVersion(v => v + 1);
  };

  // Kiểm tra phiên đăng nhập với máy chủ khi mở lại web
  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const savedToken = localStorage.getItem('agro_token');
        const savedUser = localStorage.getItem('agro_user');

        if (savedToken && savedUser) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
          const res = await axios.get('/api/auth/me');
          if (!cancelled && res.data?.success && res.data.data) {
            const freshUser = res.data.data;
            localStorage.setItem('agro_user', JSON.stringify(freshUser));
            setCurrentUser(freshUser);
            setActiveTab(freshUser.role === 'admin' ? 'dashboard' : 'telemetry');
          }
        }
      } catch (err) {
        console.error('Lỗi khôi phục phiên đăng nhập:', err);
        localStorage.removeItem('agro_token');
        localStorage.removeItem('agro_user');
        delete axios.defaults.headers.common['Authorization'];
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    };
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  // Tải danh sách thiết bị & số yêu cầu chờ duyệt (Admin)
  const loadDevices = async () => {
    if (!currentUser) return;
    try {
      setIsRefreshing(true);
      const url = currentUser.role === 'admin'
        ? '/api/devices'
        : `/api/devices?ownerId=${currentUser.id}`;
      const requestsPromise = currentUser.role === 'admin'
        ? axios.get('/api/devices/requests?status=pending').catch(() => null)
        : Promise.resolve(null);

      const [res, reqRes] = await Promise.all([axios.get(url), requestsPromise]);
      if (res.data?.success) {
        setDevices(res.data.data);
      }
      if (reqRes?.data?.success) {
        setPendingRequestsCount(reqRes.data.data.length);
      } else if (currentUser.role !== 'admin') {
        setPendingRequestsCount(0);
      }
    } catch (err) {
      console.error('Lỗi nạp danh sách thiết bị:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadDevices();
    loadAlertsCount();
    const timer = setInterval(loadAlertsCount, 15000);
    return () => clearInterval(timer);
  }, [currentUser?.id, currentUser?.role]);

  // Đồng bộ khi admin tự đổi quyền chính mình
  const handleCurrentUserUpdated = (updatedUser) => {
    localStorage.setItem('agro_user', JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);
    const adminOnlyTabs = ['dashboard', 'users', 'thresholds', 'settings'];
    if (updatedUser.role !== 'admin' && adminOnlyTabs.includes(activeTab)) {
      setActiveTab('telemetry');
    }
  };

  // Map breadcrumbs đồng nhất với Sidebar theo từng vai trò
  const getBreadcrumbs = () => {
    const isAdmin = currentUser?.role === 'admin';
    switch (activeTab) {
      case 'dashboard':
        return ['Vận hành', 'Tổng quan hệ thống'];
      case 'telemetry':
        return isAdmin ? ['Vận hành', 'Số đo hiện tại'] : ['Vườn của tôi', 'Tổng quan'];
      case 'devices':
        return [isAdmin ? 'Vận hành' : 'Vườn của tôi', 'Thiết bị'];
      case 'thresholds':
        return ['Quản trị', 'Ngưỡng cảnh báo'];
      case 'alerts':
        return [isAdmin ? 'Vận hành' : 'Vườn của tôi', 'Cảnh báo'];
      case 'analytics':
        return [isAdmin ? 'Vận hành' : 'Vườn của tôi', isAdmin ? 'Lịch sử dữ liệu' : 'Lịch sử'];
      case 'field_logs':
        return [isAdmin ? 'Canh tác' : 'Vườn của tôi', 'Nhật ký'];
      case 'recommendations':
        return [isAdmin ? 'Canh tác' : 'Vườn của tôi', 'Tư vấn'];
      case 'users':
        return ['Quản trị', 'Tài khoản'];
      case 'settings':
        return ['Quản trị', 'Hệ số tính toán'];
      default:
        return ['Hệ thống'];
    }
  };

  // Màn hình chờ khi đang đọc Token
  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs muted">
        Đang khởi tạo phiên làm việc...
      </div>
    );
  }

  // 1. NẾU CHƯA ĐĂNG NHẬP: Hiển thị Màn hình Đăng Nhập / Đăng Ký (UC-01 & UC-02)
  if (!currentUser) {
    return (
      <AuthPage 
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setActiveTab(user.role === 'admin' ? 'dashboard' : 'telemetry');
        }} 
      />
    );
  }

  // 2. NẾU ĐÃ ĐĂNG NHẬP: Hiển thị Giao diện theo đúng vai trò (Nông dân vs Admin)
  const usableDevices = devices.filter(d => d.provisioning_status !== 'rejected');

  return (
    <div className="app-shell">
      {mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true"></div>
      )}

      {/* Sidebar phân quyền */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={setActiveTab} 
        counts={{ devices: usableDevices.length, alerts: unreadAlerts }}
        currentUser={currentUser}
        onLogout={handleLogout}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Vùng làm việc chính */}
      <div className="app-content">
        <Topbar 
          breadcrumbs={getBreadcrumbs()}
          onRefresh={() => { loadDevices(); handleAlertsMutated(); }}
          isRefreshing={isRefreshing}
          currentUser={currentUser}
          onLogout={handleLogout}
          unreadCount={unreadAlerts}
          alertsVersion={alertsVersion}
          onAlertsMutated={handleAlertsMutated}
          onOpenAlerts={() => setActiveTab('alerts')}
          onToggleMenu={() => setMobileNavOpen(prev => !prev)}
          menuOpen={mobileNavOpen}
        />

        <main className="workspace">
          {activeTab === 'dashboard' && currentUser.role === 'admin' && (
            <DashboardOverview 
              devices={usableDevices} 
              unreadAlerts={unreadAlerts}
              pendingRequestsCount={pendingRequestsCount}
              onNavigateToDevices={() => setActiveTab('devices')} 
              onNavigateToAlerts={() => setActiveTab('alerts')}
            />
          )}

          {activeTab === 'telemetry' && (
            <RealtimeMonitoring 
              devices={usableDevices} 
              onNavigateToDevices={() => setActiveTab('devices')} 
            />
          )}

          {activeTab === 'devices' && (
            <DeviceManagement 
              currentUser={currentUser} 
              onDevicesChanged={loadDevices} 
            />
          )}

          {activeTab === 'thresholds' && currentUser.role === 'admin' && (
            <ThresholdConfig />
          )}

          {activeTab === 'alerts' && (
            <AlertManagement
              unreadCount={unreadAlerts}
              alertsVersion={alertsVersion}
              onAlertResolved={handleAlertsMutated}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsHistory devices={usableDevices} />
          )}

          {activeTab === 'field_logs' && (
            <FieldLogs devices={usableDevices} />
          )}

          {activeTab === 'recommendations' && (
            <Recommendations devices={usableDevices} />
          )}

          {activeTab === 'users' && currentUser.role === 'admin' && (
            <UserManagement
              currentUser={currentUser}
              onCurrentUserUpdated={handleCurrentUserUpdated}
            />
          )}

          {activeTab === 'settings' && currentUser.role === 'admin' && (
            <SystemSettings />
          )}
        </main>

        <footer className="app-footer">
          <span>AgroPrecision · Quan trắc đất đa chế độ</span>
          <span>Số liệu hiển thị theo thời điểm đo của trạm</span>
        </footer>
      </div>
    </div>
  );
}
