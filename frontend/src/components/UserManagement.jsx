import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, RefreshCw, ShieldCheck, Lock, Unlock } from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState, Field, Drawer } from './UI.jsx';

export default function UserManagement({ currentUser, onCurrentUserUpdated }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyUserId, setBusyUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState(null);
  const [newRole, setNewRole] = useState('farmer');
  const [updatingRole, setUpdatingRole] = useState(false);
  const [roleError, setRoleError] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setLoadError('');
      setActionError('');
      const res = await axios.get('/api/users');
      if (res.data?.success) {
        setUsers(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải danh sách người dùng:', err);
      setLoadError(err.response?.data?.message || 'Không thể tải danh sách người dùng. Vui lòng làm mới để thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (user) => {
    if (user.id === currentUser?.id) {
      setActionError('Quy tắc an toàn: Quản trị viên không thể tự khóa tài khoản của chính mình.');
      return;
    }

    const nextStatus = !user.isActive;
    const actionText = nextStatus ? 'kích hoạt lại' : 'tạm khóa';

    if (!window.confirm(`Xác nhận ${actionText} tài khoản "${user.fullName}" (${user.email})?`)) {
      return;
    }

    try {
      setBusyUserId(user.id);
      setActionError('');
      const res = await axios.patch(`/api/users/${user.id}/status`, {
        isActive: nextStatus
      });
      if (res.data?.success) {
        fetchUsers();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật trạng thái tài khoản.');
    } finally {
      setBusyUserId(null);
    }
  };

  const openRoleModal = (user) => {
    setSelectedUserForRole(user);
    setNewRole(user.role);
    setRoleError('');
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!selectedUserForRole) return;

    try {
      setUpdatingRole(true);
      setRoleError('');
      const res = await axios.patch(`/api/users/${selectedUserForRole.id}/role`, {
        role: newRole
      });
      if (res.data?.success) {
        const updatedUser = res.data.data;
        setShowRoleModal(false);
        if (selectedUserForRole.id === currentUser?.id && updatedUser) {
          onCurrentUserUpdated?.({ ...currentUser, role: updatedUser.role });
          return;
        }
        fetchUsers();
      }
    } catch (err) {
      setRoleError(err.response?.data?.message || 'Có lỗi xảy ra khi phân quyền vai trò.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow="Quản trị / Tài khoản"
        title="Quản lý người dùng."
        description="Tài khoản, quyền truy cập và thiết bị sở hữu trong toàn hệ thống."
        actions={
          <Button variant="secondary" onClick={fetchUsers} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Làm mới danh sách
          </Button>
        }
      />

      <div className="toolbar items-end justify-between">
        <Field label="Tìm tài khoản" htmlFor="user-search" className="w-full sm:max-w-sm">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68766a]" aria-hidden="true" />
            <input id="user-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm theo họ tên hoặc email…" className="w-full !pl-10" />
          </div>
        </Field>
        <Field label="Vai trò hệ thống" htmlFor="user-role-filter" className="w-full sm:w-auto">
          <select id="user-role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-full sm:min-w-[210px]">
            <option value="all">Tất cả ({users.length})</option>
            <option value="admin">Quản trị viên ({users.filter(u => u.role === 'admin').length})</option>
            <option value="farmer">Nông dân ({users.filter(u => u.role === 'farmer').length})</option>
          </select>
        </Field>
      </div>

      {loadError && <Notice tone="error">{loadError}</Notice>}
      {actionError && <Notice tone="error">{actionError}</Notice>}

      <section className="panel overflow-hidden" aria-labelledby="user-list-title" aria-busy={loading}>
        <div className="section-head px-5 py-4">
          <h2 id="user-list-title">Danh sách tài khoản</h2>
          {!loading && !loadError && <span className="muted">{filteredUsers.length} / {users.length} tài khoản</span>}
        </div>
        {loading ? (
          <EmptyState loading title="Đang tải tài khoản…" description="Đang lấy danh sách người dùng từ máy chủ." />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title={loadError ? 'Danh sách chưa tải được' : searchQuery || roleFilter !== 'all' ? 'Không tìm thấy tài khoản phù hợp' : 'Chưa có tài khoản trong danh sách'}
            description={loadError ? 'Dùng nút Làm mới danh sách để thử lại.' : searchQuery || roleFilter !== 'all' ? 'Thử thay đổi từ khóa hoặc chọn tất cả vai trò.' : 'Các tài khoản sẽ hiển thị tại đây khi có dữ liệu.'}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table w-full text-left">
              <caption className="sr-only">Tài khoản người dùng, email, vai trò, số trạm sở hữu và trạng thái</caption>
              <thead>
                <tr>
                  <th scope="col">Người dùng</th>
                  <th scope="col">Vai trò</th>
                  <th scope="col">Thiết bị sở hữu</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col" className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  const isAdmin = u.role === 'admin';

                  return (
                    <tr key={u.id} className={isCurrent ? 'bg-[#eaf0e3]/50' : ''}>
                      <th scope="row" className="min-w-[250px] text-left font-normal">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 rounded-[6px] bg-[#eaf0e3] px-2 py-1 tabular-nums text-xs text-[var(--green)]">#{String(u.id).padStart(3, '0')}</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 font-semibold">{u.fullName}{isCurrent && <Badge tone="success">Bạn</Badge>}</div>
                            <div className="muted mt-1 break-all text-sm">{u.email}</div>
                          </div>
                        </div>
                      </th>
                      <td>
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          {isAdmin && <ShieldCheck size={16} className="text-[#3f6044]" aria-hidden="true" />}
                          {isAdmin ? 'Quản trị viên' : 'Chủ hộ nông dân'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap tabular-nums"><strong className="font-semibold">{u.devicesCount}</strong> <span className="muted">trạm đo</span></td>
                      <td><Badge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Đang hoạt động' : 'Tạm khóa'}</Badge></td>
                      <td>
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <Button variant="secondary" onClick={() => openRoleModal(u)} title="Thay đổi vai trò quản trị / nông dân" aria-label={`Đổi quyền cho ${u.fullName}`}>Đổi quyền</Button>
                          {isCurrent ? (
                            <Button variant="ghost" disabled title="Không thể tự khóa tài khoản của chính mình"><Lock size={15} aria-hidden="true" /> Khóa</Button>
                          ) : (
                            <Button variant="ghost" busy={busyUserId === u.id} className={u.isActive ? '!text-[#b56743]' : '!text-[#3f6044]'} onClick={() => handleToggleStatus(u)} aria-label={`${u.isActive ? 'Khóa' : 'Kích hoạt'} tài khoản ${u.fullName}`}>
                              {busyUserId !== u.id && (u.isActive ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />)}
                              {u.isActive ? 'Khóa' : 'Kích hoạt'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-2 border-t border-[#dde2d6] pt-4 text-sm text-[#68766a] sm:flex-row sm:justify-between">
        <p>Nông dân: dữ liệu thuộc sở hữu. Quản trị viên: toàn hệ thống.</p>
        <p>Không thể tự khóa tài khoản đang đăng nhập.</p>
      </div>

      <Drawer open={showRoleModal && Boolean(selectedUserForRole)} onClose={() => setShowRoleModal(false)} title="Quyền của tài khoản" description="Cập nhật phạm vi truy cập các tính năng hệ thống.">
        {selectedUserForRole && (
          <form onSubmit={handleSaveRole} className="form-stack">
            {roleError && <Notice tone="error">{roleError}</Notice>}
            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4">
              <div className="font-semibold">{selectedUserForRole.fullName}</div>
              <div className="muted mt-1 break-all">{selectedUserForRole.email}</div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex flex-wrap justify-between gap-2"><dt className="muted">Vai trò hiện tại</dt><dd>{selectedUserForRole.role === 'admin' ? 'Quản trị viên' : 'Chủ hộ nông dân'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="muted">Thiết bị sở hữu</dt><dd>{selectedUserForRole.devicesCount} trạm đo</dd></div>
              </dl>
            </div>

            <fieldset className="min-w-0 space-y-3">
              <legend className="mb-3 font-semibold">Chọn vai trò mới</legend>
              <label htmlFor="user-role-farmer" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-4 ${newRole === 'farmer' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
                <input id="user-role-farmer" type="radio" name="role" value="farmer" checked={newRole === 'farmer'} onChange={() => setNewRole('farmer')} className="mt-1 accent-[#3f6044]" />
                <span><span className="block font-semibold">Chủ hộ nông dân</span><span className="muted mt-1 block text-sm">Truy cập trạm đo cá nhân, theo dõi số liệu và biểu đồ, ghi nhật ký và nhận tư vấn NPK.</span></span>
              </label>
              <label htmlFor="user-role-admin" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-4 ${newRole === 'admin' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
                <input id="user-role-admin" type="radio" name="role" value="admin" checked={newRole === 'admin'} onChange={() => setNewRole('admin')} className="mt-1 accent-[#3f6044]" />
                <span><span className="block font-semibold">Quản trị viên</span><span className="muted mt-1 block text-sm">Xem tổng quan, quản lý toàn bộ trạm đo, ngưỡng cảnh báo, người dùng và tham số hệ thống.</span></span>
              </label>
            </fieldset>

            {newRole === 'admin' && <Notice tone="warning">Vai trò này có quyền quản trị toàn hệ thống.</Notice>}
            {selectedUserForRole.id === currentUser?.id && <Notice tone="info">Đây là tài khoản của bạn. Hệ thống sẽ kiểm tra còn quản trị viên khác hoạt động trước khi cho phép tự hạ quyền.</Notice>}

            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setShowRoleModal(false)}>Hủy bỏ</Button>
              <Button type="submit" busy={updatingRole}>{updatingRole ? 'Đang lưu…' : 'Lưu phân quyền'}</Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
