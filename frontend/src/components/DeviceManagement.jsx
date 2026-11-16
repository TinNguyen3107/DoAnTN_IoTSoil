import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Radio,
  Smartphone,
  Key,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Power,
  Trash2,
  Search,
  QrCode,
  Pencil,
  Link2Off,
  UserCheck,
  Cpu,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Send
} from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState, Field, Drawer } from './UI.jsx';

const generateRandomMac = () => {
  const bytes = ['A4', 'CF', '12'];
  for (let i = 0; i < 3; i++) {
    bytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase());
  }
  return bytes.join(':');
};

const getStatusBadge = (device) => {
  const st = device.provisioning_status || 'active';
  if (st === 'pending_approval') return <Badge tone="warning">Chờ Admin duyệt</Badge>;
  if (st === 'awaiting_activation') return <Badge tone="warning">Chờ nhập mã kích hoạt</Badge>;
  if (st === 'pairing_open') return <Badge tone="warning">Đang mở ghép nối</Badge>;
  if (st === 'rejected') return <Badge tone="danger">Bị từ chối</Badge>;
  if (st === 'unclaimed' || !device.owner_id) return <Badge tone="warning">Chờ nhận (Kho)</Badge>;
  return <Badge tone={device.is_active ? 'success' : 'neutral'}>{device.is_active ? 'Hoạt động' : 'Tạm dừng'}</Badge>;
};

export default function DeviceManagement({ currentUser, onDevicesChanged }) {
  const isAdmin = currentUser?.role === 'admin';

  const [devices, setDevices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [copiedField, setCopiedField] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Nông dân Drawer 1: Tạo trạm mới kèm MAC & gửi yêu cầu duyệt (Cách B)
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqType, setReqType] = useState('handheld');
  const [reqMac, setReqMac] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqError, setReqError] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);

  // Nông dân Drawer 2: Nhập mã kích hoạt 6 số Admin cấp
  const [activateTarget, setActivateTarget] = useState(null);
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [activateError, setActivateError] = useState('');
  const [activating, setActivating] = useState(false);

  // Nông dân Drawer 3: Hướng dẫn ghép nối tự động qua MAC (sau khi mở cổng)
  const [pairingTarget, setPairingTarget] = useState(null);

  // Nông dân Drawer 4: Xin Admin cấp lại khóa cho trạm đang dùng
  const [rekeyTarget, setRekeyTarget] = useState(null);
  const [rekeyMac, setRekeyMac] = useState('');
  const [rekeyReason, setRekeyReason] = useState('');
  const [rekeyError, setRekeyError] = useState('');
  const [submittingRekey, setSubmittingRekey] = useState(false);

  // Nông dân Drawer 5: Kích hoạt trạm xuất xưởng sẵn bằng Mã trạm + PIN
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimCode, setClaimCode] = useState('');
  const [claimPin, setClaimPin] = useState('');
  const [claimCustomName, setClaimCustomName] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claiming, setClaiming] = useState(false);

  // Nông dân Drawer 6: Mã chuyển nhượng sau khi gỡ trạm
  const [releasedInfo, setReleasedInfo] = useState(null);

  // Admin Drawer: Duyệt / Từ chối yêu cầu từ nông dân
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveNote, setApproveNote] = useState('');
  const [approveResult, setApproveResult] = useState(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Admin Drawer: Xuất xưởng thiết bị trực tiếp & xem API Key
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createType, setCreateType] = useState('fixed');
  const [createMac, setCreateMac] = useState('');
  const [createOwnerId, setCreateOwnerId] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [showCredentialModal, setShowCredentialModal] = useState(false);
  const [credentialInfo, setCredentialInfo] = useState({
    deviceName: '',
    deviceCode: '',
    hardwareMac: '',
    claimPin: '',
    apiKey: '',
    isNew: true
  });

  // Cả 2 quyền: Đổi tên trạm
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Admin: Bàn giao / thu hồi chủ sở hữu
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assignError, setAssignError] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const [devRes, reqRes] = await Promise.all([
        axios.get('/api/devices'),
        axios.get('/api/devices/requests')
      ]);

      if (devRes.data?.success) {
        setDevices(devRes.data.data);
      }
      if (reqRes.data?.success) {
        setRequests(reqRes.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu trạm đo:', err);
      setLoadError(err.response?.data?.message || 'Không thể tải danh sách trạm đo. Vui lòng thử làm mới.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await axios.get('/api/users');
      if (res.data?.success) {
        setUsers(res.data.data);
      }
    } catch {
      // Giữ danh sách trống nếu không tải được
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAllData();
      if (isAdmin) fetchUsers();
    }
  }, [currentUser?.id, currentUser?.role]);

  const copyText = (text, fieldKey) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(''), 2500);
    } catch {
      // Bỏ qua nếu môi trường không hỗ trợ clipboard
    }
  };

  // ==============================================================
  // NÔNG DÂN: LUỒNG CÁCH B (TẠO TRẠM + MAC -> NHẬP MÃ -> GHÉP NỐI -> XIN CẤP LẠI KEY)
  // ==============================================================

  const handleSubmitNewRequest = async (e) => {
    e.preventDefault();
    if (!reqName.trim()) {
      setReqError('Vui lòng đặt tên khu vườn / trạm đo.');
      return;
    }
    if (!reqMac.trim()) {
      setReqError('Vui lòng nhập Mã phần cứng (MAC ESP32) của thiết bị.');
      return;
    }

    setReqError('');
    setSubmittingReq(true);
    setActionError('');
    setActionSuccess('');

    try {
      const res = await axios.post('/api/devices/request', {
        name: reqName.trim(),
        type: reqType,
        hardwareMac: reqMac.trim(),
        reason: reqReason.trim()
      });

      if (res.data?.success) {
        setShowRequestModal(false);
        setReqName('');
        setReqType('handheld');
        setReqMac('');
        setReqReason('');
        setActionSuccess(res.data.message);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setReqError(err.response?.data?.message || 'Không thể gửi yêu cầu tạo trạm.');
    } finally {
      setSubmittingReq(false);
    }
  };

  const openActivateModal = (device) => {
    setActivateTarget(device);
    setActivationCodeInput('');
    setActivateError('');
  };

  const handleActivateSubmit = async (e) => {
    e.preventDefault();
    if (!activateTarget) return;
    if (!activationCodeInput.trim()) {
      setActivateError('Vui lòng nhập Mã kích hoạt 6 chữ số do Quản trị viên cấp.');
      return;
    }

    setActivateError('');
    setActivating(true);
    setActionError('');

    try {
      const res = await axios.post(`/api/devices/${activateTarget.id}/activate`, {
        activationCode: activationCodeInput.trim()
      });
      if (res.data?.success) {
        const updated = res.data.data;
        setActivateTarget(null);
        setActionSuccess(res.data.message);
        setPairingTarget(updated);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setActivateError(err.response?.data?.message || 'Mã kích hoạt không chính xác.');
    } finally {
      setActivating(false);
    }
  };

  const handleReopenPairing = async (device) => {
    try {
      setBusyId(`dev-${device.id}`);
      setActionError('');
      setActionSuccess('');
      const res = await axios.post(`/api/devices/${device.id}/reopen-pairing`);
      if (res.data?.success) {
        const updated = res.data.data;
        setPairingTarget(updated);
        setActionSuccess(res.data.message);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Không thể gia hạn cửa sổ ghép nối.');
    } finally {
      setBusyId(null);
    }
  };

  const openRekeyModal = (device) => {
    setRekeyTarget(device);
    setRekeyMac(device.hardware_mac || '');
    setRekeyReason('');
    setRekeyError('');
  };

  const handleRekeySubmit = async (e) => {
    e.preventDefault();
    if (!rekeyTarget) return;
    if (!rekeyMac.trim()) {
      setRekeyError('Vui lòng nhập Mã phần cứng (MAC) để đồng bộ khóa mới.');
      return;
    }

    setRekeyError('');
    setSubmittingRekey(true);
    setActionError('');

    try {
      const res = await axios.post(`/api/devices/${rekeyTarget.id}/request-rekey`, {
        newHardwareMac: rekeyMac.trim(),
        reason: rekeyReason.trim()
      });
      if (res.data?.success) {
        setRekeyTarget(null);
        setActionSuccess(res.data.message);
        await fetchAllData();
      }
    } catch (err) {
      setRekeyError(err.response?.data?.message || 'Không thể gửi yêu cầu cấp lại khóa.');
    } finally {
      setSubmittingRekey(false);
    }
  };

  const handleCancelRequest = async (reqItem) => {
    if (!window.confirm(`Xác nhận hủy / xóa yêu cầu cho trạm "${reqItem.requested_name}"?`)) return;
    try {
      setBusyId(`req-${reqItem.id}`);
      setActionError('');
      setActionSuccess('');
      await axios.delete(`/api/devices/requests/${reqItem.id}`);
      setActionSuccess('Đã xóa yêu cầu thành công.');
      await fetchAllData();
      onDevicesChanged?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Không thể hủy yêu cầu.');
    } finally {
      setBusyId(null);
    }
  };

  // Xóa yêu cầu / bản nháp trực tiếp từ dòng thiết bị (khi đang pending_approval hoặc rejected)
  const handleCancelDeviceDraft = async (device) => {
    const matchingReq = requests.find(
      (r) => r.device_id === device.id && r.request_type === 'new_device'
    );
    if (!matchingReq) return;
    await handleCancelRequest(matchingReq);
  };

  // ==============================================================
  // ADMIN: DUYỆT / TỪ CHỐI YÊU CẦU
  // ==============================================================

  const openApproveModal = (reqItem) => {
    setApproveTarget(reqItem);
    setApproveNote('');
    setApproveResult(null);
    setApproveError('');
  };

  const handleApproveSubmit = async (e) => {
    e.preventDefault();
    if (!approveTarget) return;
    setApproving(true);
    setApproveError('');
    setActionError('');

    try {
      const res = await axios.post(`/api/devices/requests/${approveTarget.id}/approve`, {
        adminNote: approveNote.trim()
      });
      if (res.data?.success) {
        setApproveResult(res.data.data);
        setActionSuccess(res.data.message);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setApproveError(err.response?.data?.message || 'Không thể duyệt yêu cầu.');
    } finally {
      setApproving(false);
    }
  };

  const openRejectModal = (reqItem) => {
    setRejectTarget(reqItem);
    setRejectNote('');
    setRejectError('');
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (!rejectNote.trim()) {
      setRejectError('Vui lòng nhập lý do từ chối để nông dân nắm được.');
      return;
    }

    setRejecting(true);
    setRejectError('');
    setActionError('');

    try {
      const res = await axios.post(`/api/devices/requests/${rejectTarget.id}/reject`, {
        adminNote: rejectNote.trim()
      });
      if (res.data?.success) {
        setRejectTarget(null);
        setActionSuccess('Đã từ chối yêu cầu.');
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setRejectError(err.response?.data?.message || 'Không thể từ chối yêu cầu.');
    } finally {
      setRejecting(false);
    }
  };

  // ==============================================================
  // LUỒNG PHỤ / QUẢN TRỊ KHO & VẬN HÀNH CHUNG
  // ==============================================================

  const handleClaimDevice = async (e) => {
    e.preventDefault();
    if (!claimCode.trim()) {
      setClaimError('Vui lòng nhập Mã thiết bị.');
      return;
    }
    if (!claimPin.trim()) {
      setClaimError('Vui lòng nhập Mã PIN 6 chữ số.');
      return;
    }

    setClaimError('');
    setClaiming(true);
    setActionSuccess('');

    try {
      const res = await axios.post('/api/devices/claim', {
        deviceCode: claimCode.trim().toUpperCase(),
        claimPin: claimPin.trim(),
        customName: claimCustomName.trim()
      });
      if (res.data?.success) {
        setShowClaimModal(false);
        setClaimCode('');
        setClaimPin('');
        setClaimCustomName('');
        setActionSuccess(res.data.message);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setClaimError(err.response?.data?.message || 'Không thể kích hoạt thiết bị.');
    } finally {
      setClaiming(false);
    }
  };

  const handleCreateDevice = async (e) => {
    e.preventDefault();
    if (!createName.trim()) {
      setCreateError('Vui lòng nhập tên gợi nhớ cho thiết bị.');
      return;
    }
    setCreateError('');
    setCreating(true);

    try {
      const res = await axios.post('/api/devices', {
        name: createName.trim(),
        type: createType,
        hardwareMac: createMac.trim(),
        ownerId: createOwnerId === '' ? null : Number(createOwnerId)
      });

      if (res.data?.success) {
        const d = res.data.data;
        setShowCreateModal(false);
        setCreateName('');
        setCreateType('fixed');
        setCreateMac('');
        setCreateOwnerId('');
        setCredentialInfo({
          deviceName: d.device.name,
          deviceCode: d.deviceCode,
          hardwareMac: d.hardwareMac || '',
          claimPin: d.claimPin || '',
          apiKey: d.apiKey,
          isNew: true
        });
        setShowCredentialModal(true);
        setActionSuccess(`Đã xuất xưởng thiết bị ${d.deviceCode}.`);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setCreateError(err.response?.data?.message || 'Có lỗi xảy ra khi xuất xưởng trạm đo.');
    } finally {
      setCreating(false);
    }
  };

  const openRenameModal = (device) => {
    setRenameTarget(device);
    setRenameValue(device.name);
    setRenameError('');
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) {
      setRenameError('Tên trạm đo không được để trống.');
      return;
    }
    try {
      setRenaming(true);
      setRenameError('');
      const res = await axios.patch(`/api/devices/${renameTarget.id}/rename`, {
        name: renameValue.trim()
      });
      if (res.data?.success) {
        setRenameTarget(null);
        setActionSuccess('Đã cập nhật tên trạm đo.');
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setRenameError(err.response?.data?.message || 'Không thể đổi tên trạm đo.');
    } finally {
      setRenaming(false);
    }
  };

  const openAssignModal = (device) => {
    setAssignTarget(device);
    setAssignOwnerId(device.owner_id ? String(device.owner_id) : '');
    setAssignError('');
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignTarget) return;
    try {
      setAssigning(true);
      setAssignError('');
      const res = await axios.patch(`/api/devices/${assignTarget.id}/assign`, {
        ownerId: assignOwnerId === '' ? null : Number(assignOwnerId)
      });
      if (res.data?.success) {
        const result = res.data.data;
        setAssignTarget(null);
        setActionSuccess(
          result?.newClaimPin
            ? `Đã thu hồi trạm ${result.device.device_code} về kho. Mã PIN mới: ${result.newClaimPin}.`
            : res.data.message
        );
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Không thể bàn giao thiết bị.');
    } finally {
      setAssigning(false);
    }
  };

  const handleRegenerateKey = async (device) => {
    if (!window.confirm(`CẢNH BÁO KỸ THUẬT:\nCấp lại API Key trực tiếp cho "${device.name}" (${device.device_code}) sẽ VÔ HIỆU HÓA khóa hiện tại!\n\nTiếp tục?`)) {
      return;
    }
    try {
      setBusyId(`dev-${device.id}`);
      setActionError('');
      const res = await axios.post(`/api/devices/${device.id}/regenerate-key`);
      if (res.data?.success) {
        setCredentialInfo({
          deviceName: res.data.data.deviceName,
          deviceCode: res.data.data.deviceCode,
          hardwareMac: device.hardware_mac || '',
          claimPin: '',
          apiKey: res.data.data.newApiKey,
          isNew: false
        });
        setShowCredentialModal(true);
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Không thể cấp lại API Key.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleStatus = async (deviceId, currentStatus) => {
    try {
      setBusyId(`dev-${deviceId}`);
      setActionError('');
      await axios.patch(`/api/devices/${deviceId}/status`, { isActive: !currentStatus });
      await fetchAllData();
      onDevicesChanged?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Lỗi cập nhật trạng thái.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUnclaimDevice = async (device) => {
    if (!window.confirm(`Gỡ liên kết trạm "${device.name}" (${device.device_code}) khỏi tài khoản của bạn?`)) return;
    try {
      setBusyId(`dev-${device.id}`);
      setActionError('');
      const res = await axios.post(`/api/devices/${device.id}/unclaim`);
      if (res.data?.success) {
        setReleasedInfo(res.data.data);
        await fetchAllData();
        onDevicesChanged?.();
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Không thể gỡ liên kết trạm đo.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteDevice = async (device) => {
    if (!window.confirm(`Xác nhận xóa vĩnh viễn trạm đo "${device.name}" (${device.device_code})?\nToàn bộ số đo, cảnh báo và nhật ký thuộc trạm này sẽ bị xóa.`)) return;
    try {
      setBusyId(`dev-${device.id}`);
      setActionError('');
      await axios.delete(`/api/devices/${device.id}`);
      setActionSuccess(`Đã xóa trạm ${device.device_code}.`);
      await fetchAllData();
      onDevicesChanged?.();
    } catch (err) {
      setActionError(err.response?.data?.message || 'Lỗi khi xóa thiết bị.');
    } finally {
      setBusyId(null);
    }
  };

  // Tổng hợp số liệu
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const farmerActionableNotices = !isAdmin
    ? requests.filter((r) => {
        if (r.status === 'pending') return true;
        if (r.status === 'rejected') return true;
        if (r.status === 'approved' && ['awaiting_activation', 'pairing_open'].includes(r.device_provisioning_status)) {
          return true;
        }
        return false;
      })
    : [];

  const activeCount = devices.filter(d => d.provisioning_status === 'active' && d.is_active).length;
  const awaitingSetupCount = devices.filter(d => ['pending_approval', 'awaiting_activation', 'pairing_open', 'unclaimed'].includes(d.provisioning_status)).length;
  const totalReadings = devices.reduce((sum, d) => sum + Number(d.total_readings || 0), 0);

  const filteredDevices = devices.filter((d) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      d.name.toLowerCase().includes(q) ||
      (d.device_code || '').toLowerCase().includes(q) ||
      (d.hardware_mac || '').toLowerCase().includes(q) ||
      (d.owner_name || '').toLowerCase().includes(q);
    const matchesType = typeFilter === 'all' || d.type === typeFilter;
    const st = d.provisioning_status || 'active';
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && st === 'active') ||
      (statusFilter === 'setup' && ['pending_approval', 'awaiting_activation', 'pairing_open', 'unclaimed'].includes(st)) ||
      (statusFilter === 'rejected' && st === 'rejected');
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow={isAdmin ? 'Phê duyệt & Quản lý trạm đo' : 'Thiết bị & Ghép nối phần cứng'}
        title={isAdmin ? 'Duyệt yêu cầu & cấp khóa trạm.' : 'Mỗi trạm, một góc vườn.'}
        description={isAdmin
          ? 'Duyệt yêu cầu đăng ký cảm biến / xin cấp lại khóa từ nông dân, hoặc xuất xưởng trạm mới trực tiếp.'
          : 'Tạo trạm mới kèm Mã máy (MAC), nhận mã kích hoạt từ Quản trị viên để ghép nối cảm biến tự động và theo dõi chỉ số NPK.'}
        actions={
          isAdmin ? (
            <Button onClick={() => { setShowCreateModal(true); setCreateError(''); }}>
              <Plus size={16} aria-hidden="true" /> Xuất xưởng trực tiếp
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <Button variant="secondary" onClick={() => { setShowClaimModal(true); setClaimError(''); }}>
                <QrCode size={16} aria-hidden="true" /> Kích hoạt bằng Mã &amp; PIN
              </Button>
              <Button onClick={() => { setShowRequestModal(true); setReqError(''); }}>
                <Plus size={16} aria-hidden="true" /> Tạo trạm mới
              </Button>
            </div>
          )
        }
      />

      {isAdmin ? (
        <dl className="stat-strip" aria-label="Tổng quan thiết bị toàn hệ thống">
          <div><dt className="muted">Tổng thiết bị</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{loading || loadError ? '—' : devices.length}</dd></div>
          <div><dt className="muted">Yêu cầu chờ duyệt</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#b56743]">{loading || loadError ? '—' : pendingRequests.length}</dd></div>
          <div><dt className="muted">Đang chờ kích hoạt / ghép nối</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{loading || loadError ? '—' : awaitingSetupCount}</dd></div>
          <div><dt className="muted">Đang hoạt động</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#3f6044]">{loading || loadError ? '—' : activeCount}</dd></div>
        </dl>
      ) : (
        <dl className="stat-strip" aria-label="Tổng quan thiết bị trong vườn">
          <div><dt className="muted">Trạm trong vườn</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{loading || loadError ? '—' : devices.length}</dd></div>
          <div><dt className="muted">Đang hoạt động</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#3f6044]">{loading || loadError ? '—' : activeCount}</dd></div>
          <div><dt className="muted">Chờ duyệt / ghép nối</dt><dd className="mt-1 text-2xl font-semibold tabular-nums text-[#b56743]">{loading || loadError ? '—' : awaitingSetupCount}</dd></div>
          <div><dt className="muted">Tổng bản ghi đã đo</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{loading || loadError ? '—' : totalReadings.toLocaleString('vi-VN')}</dd></div>
        </dl>
      )}

      {loadError && <Notice tone="error">{loadError}</Notice>}
      {actionError && <Notice tone="error">{actionError}</Notice>}
      {actionSuccess && <Notice tone="success">{actionSuccess}</Notice>}

      {/* ADMIN: Hàng chờ duyệt yêu cầu từ Nông dân */}
      {isAdmin && pendingRequests.length > 0 && (
        <section className="panel space-y-4 border-[#b56743]/40 bg-[#fbf7f2]" aria-labelledby="pending-requests-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dde2d6] pb-3">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={20} className="text-[#b56743]" aria-hidden="true" />
              <div>
                <h2 id="pending-requests-title" className="text-xl">Yêu cầu chờ phê duyệt ({pendingRequests.length})</h2>
                <p className="muted text-xs mt-0.5">Kiểm tra thông tin trạm &amp; Mã phần cứng (MAC) trước khi cấp mã kích hoạt cho nông dân.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {pendingRequests.map((reqItem) => (
              <article key={reqItem.id} className="flex flex-col justify-between gap-4 rounded-[6px] border border-[#dde2d6] bg-[#fffefa] p-4 md:flex-row md:items-center">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={reqItem.request_type === 'new_device' ? 'warning' : 'danger'}>
                      {reqItem.request_type === 'new_device' ? 'Xin cấp trạm mới' : 'Xin cấp lại khóa (Rekey)'}
                    </Badge>
                    <strong className="text-sm">{reqItem.requested_name}</strong>
                    <span className="muted text-xs">· {reqItem.device_type === 'fixed' ? 'Cố định' : 'Cầm tay'}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                    <span>Người gửi: <strong>{reqItem.requester_name}</strong> ({reqItem.requester_email})</span>
                    <span>MAC: <strong className="mono-tabular text-[#3f6044]">{reqItem.hardware_mac}</strong></span>
                    <span className="muted tabular-nums">{new Date(reqItem.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                  {reqItem.reason && <p className="muted text-xs">Lý do: {reqItem.reason}</p>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button variant="secondary" className="!text-[#a14331]" disabled={busyId === `req-${reqItem.id}`} onClick={() => openRejectModal(reqItem)}>
                    <XCircle size={15} aria-hidden="true" /> Từ chối
                  </Button>
                  <Button disabled={busyId === `req-${reqItem.id}`} onClick={() => openApproveModal(reqItem)}>
                    <CheckCircle2 size={15} aria-hidden="true" /> Duyệt &amp; Cấp mã
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* NÔNG DÂN: Hộp thông báo trạng thái yêu cầu & Mã kích hoạt Admin gửi */}
      {!isAdmin && farmerActionableNotices.length > 0 && (
        <section className="space-y-3" aria-label="Thông báo kích hoạt thiết bị">
          {farmerActionableNotices.map((reqItem) => {
            const dev = devices.find(d => d.id === reqItem.device_id);
            if (reqItem.status === 'approved' && reqItem.device_provisioning_status === 'awaiting_activation') {
              return (
                <Notice key={reqItem.id} tone="success">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
                    <div className="space-y-1">
                      <div className="font-semibold">
                        Admin đã duyệt {reqItem.request_type === 'new_device' ? 'trạm mới' : 'yêu cầu cấp lại khóa'}: "{reqItem.requested_name}" ({reqItem.hardware_mac})
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span>Mã kích hoạt của bạn:</span>
                        <strong className="mono-tabular rounded bg-[#fffefa] px-2 py-0.5 text-sm text-[#3f6044] border border-[#cedfc0]">
                          {reqItem.activation_code}
                        </strong>
                        <button type="button" className="text-link" onClick={() => copyText(reqItem.activation_code, `req-code-${reqItem.id}`)}>
                          {copiedField === `req-code-${reqItem.id}` ? <Check size={13} /> : <Copy size={13} />}
                          {copiedField === `req-code-${reqItem.id}` ? 'Đã chép' : 'Chép mã'}
                        </button>
                      </div>
                      {reqItem.admin_note && <p className="text-xs opacity-90">Ghi chú của Admin: {reqItem.admin_note}</p>}
                    </div>
                    {dev && (
                      <Button onClick={() => openActivateModal(dev)} className="shrink-0">
                        <Key size={15} aria-hidden="true" /> Nhập mã kích hoạt ngay
                      </Button>
                    )}
                  </div>
                </Notice>
              );
            }

            if (reqItem.status === 'approved' && reqItem.device_provisioning_status === 'pairing_open') {
              return (
                <Notice key={reqItem.id} tone="warning">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
                    <div>
                      <strong>Cổng ghép nối đang mở</strong> cho trạm "{reqItem.requested_name}" (MAC: <span className="mono-tabular font-semibold">{reqItem.hardware_mac}</span>). Hãy bật cảm biến (hoặc chạy Simulator) để tự nhận khóa kết nối.
                    </div>
                    {dev && (
                      <Button variant="secondary" onClick={() => setPairingTarget(dev)} className="shrink-0">
                        <Cpu size={15} aria-hidden="true" /> Xem hướng dẫn ghép nối
                      </Button>
                    )}
                  </div>
                </Notice>
              );
            }

            if (reqItem.status === 'pending') {
              return (
                <Notice key={reqItem.id} tone="info">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                    <div>
                      <Clock size={14} className="inline mr-1.5" aria-hidden="true" />
                      Yêu cầu <strong>{reqItem.request_type === 'new_device' ? 'cấp trạm mới' : 'cấp lại khóa'}</strong> cho <strong>"{reqItem.requested_name}"</strong> (MAC: <span className="mono-tabular">{reqItem.hardware_mac}</span>) đang chờ Quản trị viên duyệt.
                    </div>
                    <Button variant="ghost" disabled={busyId === `req-${reqItem.id}`} onClick={() => handleCancelRequest(reqItem)} className="shrink-0">
                      Hủy yêu cầu
                    </Button>
                  </div>
                </Notice>
              );
            }

            if (reqItem.status === 'rejected') {
              return (
                <Notice key={reqItem.id} tone="error">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full">
                    <div>
                      Yêu cầu cho <strong>"{reqItem.requested_name}"</strong> ({reqItem.hardware_mac}) đã bị từ chối. Lý do: {reqItem.admin_note || 'Không hợp lệ'}.
                    </div>
                    <Button variant="ghost" disabled={busyId === `req-${reqItem.id}`} onClick={() => handleCancelRequest(reqItem)} className="shrink-0">
                      Xóa thông báo
                    </Button>
                  </div>
                </Notice>
              );
            }

            return null;
          })}
        </section>
      )}

      <div className="toolbar items-end justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
          <Field label="Tìm trạm đo" htmlFor="device-search" className="w-full sm:max-w-xs">
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#68766a]" aria-hidden="true" />
              <input
                id="device-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAdmin ? 'Tên trạm, MAC, mã AGRO, chủ vườn…' : 'Tìm theo tên, MAC hoặc mã trạm…'}
                className="w-full !pl-10"
              />
            </div>
          </Field>

          <Field label="Loại thiết bị" htmlFor="device-type-filter" className="w-full sm:w-auto">
            <select id="device-type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-full sm:min-w-[175px]">
              <option value="all">Tất cả ({devices.length})</option>
              <option value="fixed">Cố định ({devices.filter(d => d.type === 'fixed').length})</option>
              <option value="handheld">Cầm tay ({devices.filter(d => d.type === 'handheld').length})</option>
            </select>
          </Field>

          <Field label="Trạng thái kích hoạt" htmlFor="device-status-filter" className="w-full sm:w-auto">
            <select id="device-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:min-w-[195px]">
              <option value="all">Tất cả ({devices.length})</option>
              <option value="active">Đã kích hoạt ({devices.filter(d => (d.provisioning_status || 'active') === 'active').length})</option>
              <option value="setup">Đang chờ duyệt / ghép nối ({awaitingSetupCount})</option>
              {devices.some(d => d.provisioning_status === 'rejected') && (
                <option value="rejected">Bị từ chối ({devices.filter(d => d.provisioning_status === 'rejected').length})</option>
              )}
            </select>
          </Field>
        </div>

        <Button variant="secondary" onClick={fetchAllData} disabled={loading} title="Làm mới danh sách">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Làm mới
        </Button>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="device-list-title" aria-busy={loading}>
        <div className="section-head px-5 py-4">
          <h2 id="device-list-title">{isAdmin ? 'Danh sách thiết bị toàn hệ thống' : 'Danh sách trạm đo của bạn'}</h2>
          {!loading && !loadError && <span className="muted">{filteredDevices.length} / {devices.length} trạm</span>}
        </div>

        {loading ? (
          <EmptyState loading title="Đang tải trạm đo…" description="Đang lấy danh sách và trạng thái yêu cầu từ máy chủ." />
        ) : filteredDevices.length === 0 ? (
          <EmptyState
            title={loadError
              ? 'Danh sách chưa tải được'
              : searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'Không tìm thấy trạm phù hợp'
                : isAdmin
                  ? 'Chưa có thiết bị nào trong hệ thống'
                  : 'Vườn chưa có trạm đo nào'}
            description={loadError
              ? 'Dùng nút Làm mới để tải lại danh sách.'
              : searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                ? 'Thử đổi từ khóa tìm kiếm hoặc chọn lại bộ lọc.'
                : isAdmin
                  ? 'Khi nông dân tạo trạm gửi yêu cầu, danh sách phê duyệt sẽ xuất hiện ở đây. Bạn cũng có thể bấm "Xuất xưởng trực tiếp".'
                  : 'Bấm "Tạo trạm mới", nhập Mã phần cứng (MAC) trên cảm biến và gửi yêu cầu để Quản trị viên cấp mã kích hoạt.'}
            action={!loadError && !searchQuery && typeFilter === 'all' && statusFilter === 'all' && (
              isAdmin ? (
                <Button onClick={() => { setShowCreateModal(true); setCreateError(''); }}>
                  <Plus size={16} /> Xuất xưởng trực tiếp
                </Button>
              ) : (
                <Button onClick={() => { setShowRequestModal(true); setReqError(''); }}>
                  <Plus size={16} /> Tạo trạm mới
                </Button>
              )
            )}
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table w-full text-left">
              <caption className="sr-only">Mã thiết bị, MAC phần cứng, tên trạm, trạng thái kích hoạt và thao tác</caption>
              <thead>
                <tr>
                  <th scope="col">Mã thiết bị &amp; MAC</th>
                  <th scope="col">{isAdmin ? 'Trạm & chủ sở hữu' : 'Tên khu vườn / trạm'}</th>
                  <th scope="col">Loại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Số đo</th>
                  <th scope="col">Lần gửi cuối</th>
                  <th scope="col" className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const st = device.provisioning_status || 'active';
                  return (
                    <tr key={device.id}>
                      <td className="whitespace-nowrap">
                        <div className="mono-tabular font-semibold">{device.device_code || `#${String(device.id).padStart(3, '0')}`}</div>
                        {device.hardware_mac ? (
                          <div className="muted mono-tabular text-xs mt-0.5">MAC: {device.hardware_mac}</div>
                        ) : (
                          <div className="muted text-xs tabular-nums">ID #{String(device.id).padStart(3, '0')}</div>
                        )}
                      </td>
                      <th scope="row" className="min-w-[210px] max-w-xs text-left font-normal">
                        <div className="break-words font-semibold">{device.name}</div>
                        {isAdmin ? (
                          device.owner_id ? (
                            <div className="muted mt-1 text-xs">
                              Chủ vườn: {device.owner_name || `User #${device.owner_id}`}
                              {device.owner_email ? ` (${device.owner_email})` : ''}
                              {st === 'awaiting_activation' && device.activation_code && (
                                <span className="block mt-1 text-[#8b5830]">
                                  Mã kích hoạt đã cấp: <strong className="mono-tabular">{device.activation_code}</strong>
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1 text-xs muted">
                              Lưu kho {device.claim_pin ? <>· PIN: <strong className="mono-tabular text-[var(--ink)]">{device.claim_pin}</strong></> : ''}
                            </div>
                          )
                        ) : (
                          <div className="muted mt-1 text-xs">
                            {st === 'pending_approval' && 'Đang chờ Admin xác nhận và cấp mã'}
                            {st === 'awaiting_activation' && 'Đã duyệt · Bấm "Nhập mã kích hoạt" để mở ghép nối'}
                            {st === 'pairing_open' && device.pairing_expires_at && (
                              `Mở ghép nối đến ${new Date(device.pairing_expires_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
                            )}
                            {st === 'rejected' && 'Yêu cầu bị từ chối — xem lý do ở thông báo phía trên'}
                            {st === 'active' && (
                              Number(device.pending_requests_count) > 0
                                ? 'Đang có yêu cầu xin cấp lại khóa chờ Admin duyệt'
                                : device.claimed_at
                                  ? `Kích hoạt ngày ${new Date(device.claimed_at).toLocaleDateString('vi-VN')}`
                                  : 'Đã sẵn sàng nhận số đo'
                            )}
                          </div>
                        )}
                      </th>
                      <td>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {device.type === 'fixed' ? <Radio size={16} aria-hidden="true" /> : <Smartphone size={16} aria-hidden="true" />}
                          <span>{device.type === 'fixed' ? 'Cố định' : 'Cầm tay'}</span>
                        </div>
                      </td>
                      <td>{getStatusBadge(device)}</td>
                      <td className="whitespace-nowrap tabular-nums"><strong className="font-semibold">{device.total_readings || 0}</strong> <span className="muted">bản ghi</span></td>
                      <td className="min-w-[140px] tabular-nums text-[#68766a]">
                        {device.last_online
                          ? new Date(device.last_online).toLocaleString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          : 'Chưa có dữ liệu'}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          {!isAdmin && st === 'awaiting_activation' && (
                            <Button disabled={busyId === `dev-${device.id}`} onClick={() => openActivateModal(device)}>
                              <Key size={15} aria-hidden="true" /> Nhập mã kích hoạt
                            </Button>
                          )}

                          {!isAdmin && st === 'pairing_open' && (
                            <>
                              <Button variant="secondary" onClick={() => setPairingTarget(device)}>
                                <Cpu size={15} aria-hidden="true" /> Hướng dẫn ghép nối
                              </Button>
                              <Button variant="ghost" disabled={busyId === `dev-${device.id}`} onClick={() => handleReopenPairing(device)}>
                                <RefreshCw size={14} aria-hidden="true" /> Gia hạn 15p
                              </Button>
                            </>
                          )}

                          {!isAdmin && ['pending_approval', 'rejected'].includes(st) && (
                            <Button variant="ghost" className="!text-[#a14331]" onClick={() => handleCancelDeviceDraft(device)}>
                              <Trash2 size={15} aria-hidden="true" /> {st === 'pending_approval' ? 'Hủy yêu cầu' : 'Xóa'}
                            </Button>
                          )}

                          {!['pending_approval', 'rejected'].includes(st) && (
                            <Button variant="ghost" disabled={busyId === `dev-${device.id}`} onClick={() => openRenameModal(device)} title="Đổi tên trạm">
                              <Pencil size={15} aria-hidden="true" /> Đổi tên
                            </Button>
                          )}

                          {!isAdmin && st === 'active' && (
                            <>
                              <Button
                                variant="ghost"
                                disabled={busyId === `dev-${device.id}` || Number(device.pending_requests_count) > 0}
                                onClick={() => openRekeyModal(device)}
                                title={Number(device.pending_requests_count) > 0 ? 'Đang có yêu cầu chờ Admin duyệt' : 'Gửi yêu cầu Admin cấp lại khóa'}
                              >
                                <Key size={15} aria-hidden="true" /> {Number(device.pending_requests_count) > 0 ? 'Đã gửi xin khóa' : 'Xin cấp lại khóa'}
                              </Button>
                              <Button
                                variant={device.is_active ? 'secondary' : 'primary'}
                                disabled={busyId === `dev-${device.id}`}
                                onClick={() => handleToggleStatus(device.id, device.is_active)}
                              >
                                <Power size={15} aria-hidden="true" /> {device.is_active ? 'Tạm dừng' : 'Kích hoạt'}
                              </Button>
                              <Button
                                variant="ghost"
                                className="!text-[#b56743]"
                                disabled={busyId === `dev-${device.id}`}
                                onClick={() => handleUnclaimDevice(device)}
                              >
                                <Link2Off size={15} aria-hidden="true" /> Gỡ trạm
                              </Button>
                            </>
                          )}

                          {isAdmin && (
                            <>
                              {st === 'active' && (
                                <>
                                  <Button variant="ghost" disabled={busyId === `dev-${device.id}`} onClick={() => openAssignModal(device)}>
                                    <UserCheck size={15} aria-hidden="true" /> Bàn giao
                                  </Button>
                                  <Button variant="ghost" disabled={busyId === `dev-${device.id}`} onClick={() => handleRegenerateKey(device)}>
                                    <Key size={15} aria-hidden="true" /> Cấp lại khóa
                                  </Button>
                                  <Button variant={device.is_active ? 'secondary' : 'primary'} disabled={busyId === `dev-${device.id}`} onClick={() => handleToggleStatus(device.id, device.is_active)}>
                                    <Power size={15} aria-hidden="true" /> {device.is_active ? 'Tạm dừng' : 'Kích hoạt'}
                                  </Button>
                                </>
                              )}
                              <Button variant="ghost" className="!text-[#b56743]" disabled={busyId === `dev-${device.id}`} onClick={() => handleDeleteDevice(device)} title="Xóa vĩnh viễn trạm đo">
                                <Trash2 size={16} aria-hidden="true" />
                              </Button>
                            </>
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

      <p className="muted text-sm leading-relaxed">
        {isAdmin
          ? 'Khi duyệt yêu cầu của nông dân, hệ thống gửi Mã kích hoạt 6 số về tài khoản nông dân. Khi nông dân nhập đúng mã trên Web, cảm biến có MAC tương ứng sẽ tự động tải API Key về lưu trong bộ nhớ chip.'
          : 'Sau khi tạo trạm kèm Mã phần cứng (MAC), bạn nhận Mã kích hoạt từ Quản trị viên rồi nhập trực tiếp trên Web để mở cổng ghép nối tự động cho cảm biến.'}
      </p>

      {/* NÔNG DÂN DRAWER 1: Tạo trạm thủ công kèm MAC gửi Admin duyệt */}
      <Drawer open={!isAdmin && showRequestModal} onClose={() => setShowRequestModal(false)} title="Tạo trạm mới & Gửi yêu cầu duyệt" description="Nhập thông tin trạm và Mã phần cứng (MAC) hiện trên cảm biến.">
        <form onSubmit={handleSubmitNewRequest} className="form-stack">
          {reqError && <Notice tone="error">{reqError}</Notice>}
          <Field label="Tên khu vườn / trạm đo *" htmlFor="req-device-name" hint="Ví dụ: Máy cầm tay lô cam A, Vườn rau khu 2.">
            <input id="req-device-name" type="text" value={reqName} onChange={(e) => setReqName(e.target.value)} placeholder="VD: Cầm tay vườn cam lô A" autoFocus />
          </Field>

          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 font-semibold">Loại thiết bị</legend>
            <label htmlFor="req-type-handheld" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-3.5 ${reqType === 'handheld' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
              <input id="req-type-handheld" type="radio" name="req-device-type" value="handheld" checked={reqType === 'handheld'} onChange={() => setReqType('handheld')} className="mt-1" />
              <span><span className="flex items-center gap-2 font-semibold"><Smartphone size={16} /> Thiết bị cầm tay</span><span className="muted mt-0.5 block text-xs">Bấm nút đo thủ công tại từng gốc cây, xem trực tiếp trên OLED và đồng bộ lên Web.</span></span>
            </label>
            <label htmlFor="req-type-fixed" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-3.5 ${reqType === 'fixed' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
              <input id="req-type-fixed" type="radio" name="req-device-type" value="fixed" checked={reqType === 'fixed'} onChange={() => setReqType('fixed')} className="mt-1" />
              <span><span className="flex items-center gap-2 font-semibold"><Radio size={16} /> Trạm cố định</span><span className="muted mt-0.5 block text-xs">Đo tự động định kỳ theo lịch NTP tại một vị trí cố định.</span></span>
            </label>
          </fieldset>

          <Field
            label="Mã phần cứng / MAC ESP32 *"
            htmlFor="req-device-mac"
            hint="Xem trên màn hình OLED khi bật máy hoặc nhãn vỏ thiết bị (12 ký tự Hex)."
          >
            <div className="space-y-2">
              <input
                id="req-device-mac"
                type="text"
                value={reqMac}
                onChange={(e) => setReqMac(e.target.value.toUpperCase())}
                placeholder="VD: A4:CF:12:88:9B:01"
                className="mono-tabular uppercase"
              />
              <button
                type="button"
                className="text-link text-xs"
                onClick={() => setReqMac(generateRandomMac())}
              >
                <Cpu size={13} aria-hidden="true" /> Chưa có máy thật? Điền nhanh MAC thử nghiệm
              </button>
            </div>
          </Field>

          <Field label="Ghi chú gửi Quản trị viên (tùy chọn)" htmlFor="req-device-reason">
            <textarea
              id="req-device-reason"
              rows={2}
              value={reqReason}
              onChange={(e) => setReqReason(e.target.value)}
              placeholder="VD: Mới nhận máy cầm tay, xin cấp mã kích hoạt cho vườn cam."
            />
          </Field>

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
            <Button variant="secondary" onClick={() => setShowRequestModal(false)}>Hủy bỏ</Button>
            <Button type="submit" busy={submittingReq}>
              {!submittingReq && <Send size={15} aria-hidden="true" />}{submittingReq ? 'Đang gửi…' : 'Gửi yêu cầu Admin duyệt'}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* NÔNG DÂN DRAWER 2: Nhập mã kích hoạt 6 số Admin gửi */}
      <Drawer
        open={!isAdmin && Boolean(activateTarget)}
        onClose={() => setActivateTarget(null)}
        title="Nhập mã kích hoạt trạm"
        description={activateTarget ? `${activateTarget.name} · MAC ${activateTarget.hardware_mac}` : ''}
      >
        {activateTarget && (
          <form onSubmit={handleActivateSubmit} className="form-stack">
            {activateError && <Notice tone="error">{activateError}</Notice>}
            <Notice tone="info">
              Nhập đúng <strong>Mã kích hoạt 6 chữ số</strong> mà Quản trị viên vừa cấp cho bạn. Nếu sai mã, trạm sẽ vẫn bị khóa để đảm bảo an toàn.
            </Notice>
            <Field label="Mã kích hoạt từ Admin *" htmlFor="activation-code-input" hint="Kiểm tra tại hộp thông báo ngay phía trên bảng thiết bị.">
              <input
                id="activation-code-input"
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={activationCodeInput}
                onChange={(e) => setActivationCodeInput(e.target.value)}
                placeholder="VD: 592841"
                className="mono-tabular text-lg tracking-widest"
                autoFocus
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setActivateTarget(null)}>Đóng</Button>
              <Button type="submit" busy={activating}>
                {!activating && <CheckCircle2 size={15} aria-hidden="true" />}{activating ? 'Đang kiểm tra…' : 'Kích hoạt & Mở ghép nối'}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* NÔNG DÂN DRAWER 3: Hướng dẫn ghép nối tự động qua MAC */}
      <Drawer
        open={Boolean(pairingTarget)}
        onClose={() => setPairingTarget(null)}
        title="Cổng ghép nối phần cứng đang mở"
        description={pairingTarget ? `${pairingTarget.name} · MAC ${pairingTarget.hardware_mac}` : ''}
      >
        {pairingTarget && (
          <div className="form-stack">
            <Notice tone="success">
              Mã kích hoạt chính xác! Cổng tự động nhận khóa cho MAC <strong className="mono-tabular">{pairingTarget.hardware_mac}</strong> đang mở trong <strong>15 phút</strong>.
            </Notice>

            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4 space-y-3 text-sm">
              <div className="font-semibold">Bước cuối để hoàn tất:</div>
              <p className="muted text-xs leading-relaxed">
                <strong>1. Với mạch ESP32 thật:</strong> Bật nguồn cảm biến (đảm bảo có kết nối mạng). Mạch sẽ tự gửi MAC lên máy chủ để nhận về và lưu <code>API Key</code> vào bộ nhớ chip (đúng 1 lần).
              </p>
              <div className="border-t border-[#dde2d6] pt-3 space-y-2">
                <p className="muted text-xs leading-relaxed">
                  <strong>2. Khi test trên máy tính (chưa có phần cứng):</strong> Chạy lệnh giả lập dưới đây trong terminal thư mục dự án để mô phỏng cảm biến ghép nối và bắn ngay số đo NPK đầu tiên:
                </p>
                <div className="rounded bg-[#fffefa] border border-[#cbd3c4] p-2.5 text-xs mono-tabular break-all">
                  node simulator/deviceSimulator.js --mac {pairingTarget.hardware_mac}
                </div>
                <Button variant="secondary" onClick={() => copyText(`node simulator/deviceSimulator.js --mac ${pairingTarget.hardware_mac}`, 'sim-cmd')}>
                  {copiedField === 'sim-cmd' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedField === 'sim-cmd' ? 'Đã chép lệnh giả lập' : 'Sao chép lệnh Simulator'}</span>
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-4">
              <Button variant="secondary" onClick={() => setPairingTarget(null)}>Đóng</Button>
              <Button onClick={() => { setPairingTarget(null); fetchAllData(); onDevicesChanged?.(); }}>
                <RefreshCw size={15} /> Kiểm tra lại trạng thái
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* NÔNG DÂN DRAWER 4: Xin Admin cấp lại khóa (Rekey) */}
      <Drawer
        open={!isAdmin && Boolean(rekeyTarget)}
        onClose={() => setRekeyTarget(null)}
        title="Yêu cầu cấp lại khóa"
        description={rekeyTarget ? `${rekeyTarget.name} · ${rekeyTarget.device_code}` : ''}
      >
        {rekeyTarget && (
          <form onSubmit={handleRekeySubmit} className="form-stack">
            {rekeyError && <Notice tone="error">{rekeyError}</Notice>}
            <Notice tone="info">
              Khóa hiện tại trên trạm vẫn hoạt động bình thường cho đến khi Quản trị viên phê duyệt yêu cầu này. Toàn bộ lịch sử đo NPK trước đó được giữ nguyên.
            </Notice>
            <Field label="Mã phần cứng (MAC) cần đồng bộ khóa *" htmlFor="rekey-mac-input" hint="Giữ nguyên MAC hiện tại hoặc nhập MAC mới nếu bạn thay bo mạch cảm biến khác.">
              <input
                id="rekey-mac-input"
                type="text"
                value={rekeyMac}
                onChange={(e) => setRekeyMac(e.target.value.toUpperCase())}
                placeholder="VD: A4:CF:12:88:9B:01"
                className="mono-tabular uppercase"
              />
            </Field>
            <Field label="Lý do xin cấp lại khóa *" htmlFor="rekey-reason-input">
              <textarea
                id="rekey-reason-input"
                rows={3}
                value={rekeyReason}
                onChange={(e) => setRekeyReason(e.target.value)}
                placeholder="VD: Thay cảm biến mới / nghi mất đồng bộ khóa thiết bị"
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setRekeyTarget(null)}>Hủy bỏ</Button>
              <Button type="submit" busy={submittingRekey}>
                {!submittingRekey && <Send size={15} />}{submittingRekey ? 'Đang gửi…' : 'Gửi yêu cầu Admin duyệt'}
              </Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* NÔNG DÂN DRAWER 5: Kích hoạt trạm xuất xưởng bằng Mã + PIN (tùy chọn) */}
      <Drawer open={!isAdmin && showClaimModal} onClose={() => setShowClaimModal(false)} title="Kích hoạt bằng Mã trạm & PIN" description="Dành cho trạm đã được Admin xuất xưởng sẵn kèm tem PIN 6 số.">
        <form onSubmit={handleClaimDevice} className="form-stack">
          {claimError && <Notice tone="error">{claimError}</Notice>}
          <Field label="Mã thiết bị *" htmlFor="claim-device-code">
            <input id="claim-device-code" type="text" value={claimCode} onChange={(e) => setClaimCode(e.target.value.toUpperCase())} placeholder="VD: AGRO-F-7K9M2P" className="mono-tabular uppercase" autoFocus />
          </Field>
          <Field label="Mã PIN kích hoạt *" htmlFor="claim-device-pin">
            <input id="claim-device-pin" type="text" inputMode="numeric" maxLength={12} value={claimPin} onChange={(e) => setClaimPin(e.target.value)} placeholder="VD: 482910" className="mono-tabular" />
          </Field>
          <Field label="Tên khu vườn (tùy chọn)" htmlFor="claim-custom-name">
            <input id="claim-custom-name" type="text" value={claimCustomName} onChange={(e) => setClaimCustomName(e.target.value)} placeholder="VD: Vườn cam sành khu B" />
          </Field>
          <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
            <Button variant="secondary" onClick={() => setShowClaimModal(false)}>Hủy bỏ</Button>
            <Button type="submit" busy={claiming}>{claiming ? 'Đang kích hoạt…' : 'Liên kết vào vườn'}</Button>
          </div>
        </form>
      </Drawer>

      {/* NÔNG DÂN DRAWER 6: Thông báo sau khi gỡ liên kết */}
      <Drawer open={Boolean(releasedInfo)} onClose={() => setReleasedInfo(null)} title="Đã gỡ liên kết thiết bị" description={releasedInfo ? `${releasedInfo.deviceName} · ${releasedInfo.deviceCode}` : ''}>
        {releasedInfo && (
          <div className="form-stack">
            <Notice tone="success">Thiết bị đã được gỡ khỏi vườn của bạn.</Notice>
            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4 space-y-3">
              <div className="font-semibold">Mã chuyển nhượng (nếu giao cho người khác)</div>
              <div><div className="muted text-xs">Mã thiết bị</div><div className="mono-tabular font-semibold">{releasedInfo.deviceCode}</div></div>
              <div className="border-t border-[#dde2d6] pt-2"><div className="muted text-xs">Mã PIN mới</div><div className="mono-tabular text-lg font-semibold text-[#3f6044]">{releasedInfo.newClaimPin}</div></div>
            </div>
            <Button onClick={() => setReleasedInfo(null)}>Đóng</Button>
          </div>
        )}
      </Drawer>

      {/* ADMIN DRAWER: Duyệt yêu cầu & Cấp mã kích hoạt */}
      <Drawer
        open={isAdmin && Boolean(approveTarget)}
        onClose={() => { setApproveTarget(null); setApproveResult(null); }}
        title={approveResult ? 'Đã duyệt & Cấp mã thành công' : 'Duyệt yêu cầu của nông dân'}
        description={approveTarget ? `${approveTarget.requested_name} · MAC ${approveTarget.hardware_mac}` : ''}
      >
        {approveTarget && !approveResult && (
          <form onSubmit={handleApproveSubmit} className="form-stack">
            {approveError && <Notice tone="error">{approveError}</Notice>}
            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4 space-y-2 text-xs">
              <div>Người yêu cầu: <strong>{approveTarget.requester_name}</strong> ({approveTarget.requester_email})</div>
              <div>Loại yêu cầu: <strong>{approveTarget.request_type === 'new_device' ? 'Cấp trạm mới' : 'Cấp lại khóa (Rekey)'}</strong></div>
              <div>Mã phần cứng (MAC): <strong className="mono-tabular text-[#3f6044]">{approveTarget.hardware_mac}</strong></div>
              {approveTarget.reason && <div>Lý do: {approveTarget.reason}</div>}
            </div>
            <Notice tone="info">
              Khi bấm duyệt, hệ thống sẽ sinh <strong>Mã kích hoạt 6 số</strong> và gửi về tài khoản nông dân. Sau khi nông dân nhập đúng mã trên Web, cảm biến có MAC trên sẽ tự động nhận <code>API Key</code> mới.
            </Notice>
            <Field label="Lời nhắn kèm cho nông dân (tùy chọn)" htmlFor="admin-approve-note">
              <input id="admin-approve-note" type="text" value={approveNote} onChange={(e) => setApproveNote(e.target.value)} placeholder="VD: Đã kiểm tra mã máy hợp lệ, bạn nhập mã để ghép nối nhé." />
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setApproveTarget(null)}>Hủy</Button>
              <Button type="submit" busy={approving}>{!approving && <CheckCircle2 size={15} />}{approving ? 'Đang duyệt…' : 'Xác nhận duyệt & Sinh mã'}</Button>
            </div>
          </form>
        )}

        {approveResult && (
          <div className="form-stack">
            <Notice tone="success">
              Đã phát hành Mã kích hoạt và gửi thẳng về thông báo trên giao diện của nông dân.
            </Notice>
            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4 flex items-center justify-between gap-3">
              <div>
                <div className="muted text-xs">Mã kích hoạt đã cấp (6 số)</div>
                <div className="mono-tabular text-2xl font-semibold text-[#3f6044]">{approveResult.activationCode}</div>
              </div>
              <Button variant="secondary" onClick={() => copyText(approveResult.activationCode, 'approve-code')}>
                {copiedField === 'approve-code' ? <Check size={15} /> : <Copy size={15} />}
                {copiedField === 'approve-code' ? 'Đã chép' : 'Chép mã'}
              </Button>
            </div>
            <Button onClick={() => { setApproveTarget(null); setApproveResult(null); }}>Hoàn tất &amp; Đóng</Button>
          </div>
        )}
      </Drawer>

      {/* ADMIN DRAWER: Từ chối yêu cầu */}
      <Drawer
        open={isAdmin && Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Từ chối yêu cầu"
        description={rejectTarget ? `${rejectTarget.requested_name} · ${rejectTarget.hardware_mac}` : ''}
      >
        {rejectTarget && (
          <form onSubmit={handleRejectSubmit} className="form-stack">
            {rejectError && <Notice tone="error">{rejectError}</Notice>}
            <Field label="Lý do từ chối *" htmlFor="admin-reject-note">
              <textarea id="admin-reject-note" rows={3} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="VD: Mã MAC không thuộc danh sách thiết bị hỗ trợ." autoFocus />
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setRejectTarget(null)}>Hủy</Button>
              <Button type="submit" busy={rejecting} variant="danger">{rejecting ? 'Đang gửi…' : 'Xác nhận từ chối'}</Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* ADMIN DRAWER: Xuất xưởng trạm trực tiếp */}
      <Drawer open={isAdmin && showCreateModal} onClose={() => setShowCreateModal(false)} title="Xuất xưởng trạm trực tiếp" description="Dành cho kỹ thuật viên xuất xưởng sẵn trạm từ kho hoặc bàn giao thẳng.">
        <form onSubmit={handleCreateDevice} className="form-stack">
          {createError && <Notice tone="error">{createError}</Notice>}
          <Field label="Tên thiết bị *" htmlFor="device-name">
            <input id="device-name" type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Ví dụ: Trạm cố định khu A" autoFocus />
          </Field>
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 font-semibold">Loại thiết bị</legend>
            <label htmlFor="device-type-fixed" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-3.5 ${createType === 'fixed' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
              <input id="device-type-fixed" type="radio" name="device-type" value="fixed" checked={createType === 'fixed'} onChange={() => setCreateType('fixed')} className="mt-1" />
              <span><span className="flex items-center gap-2 font-semibold"><Radio size={16} /> Trạm cố định</span><span className="muted mt-0.5 block text-xs">Đo tự động theo lịch NTP.</span></span>
            </label>
            <label htmlFor="device-type-handheld" className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-3.5 ${createType === 'handheld' ? 'border-[#3f6044] bg-[#eaf0e3]' : 'border-[#dde2d6]'}`}>
              <input id="device-type-handheld" type="radio" name="device-type" value="handheld" checked={createType === 'handheld'} onChange={() => setCreateType('handheld')} className="mt-1" />
              <span><span className="flex items-center gap-2 font-semibold"><Smartphone size={16} /> Thiết bị cầm tay</span><span className="muted mt-0.5 block text-xs">Đo thủ công bằng nút bấm trên máy.</span></span>
            </label>
          </fieldset>
          <Field label="Mã phần cứng MAC (tùy chọn)" htmlFor="device-mac-init" hint="Có thể để trống nếu nạp API Key thủ công vào firmware.">
            <input id="device-mac-init" type="text" value={createMac} onChange={(e) => setCreateMac(e.target.value.toUpperCase())} placeholder="VD: A4:CF:12:88:9B:01" className="mono-tabular uppercase" />
          </Field>
          <Field label="Hình thức cấp phát" htmlFor="device-assign-init">
            <select id="device-assign-init" value={createOwnerId} onChange={(e) => setCreateOwnerId(e.target.value)}>
              <option value="">Lưu kho · Tạo Mã thiết bị &amp; PIN</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>Bàn giao trực tiếp cho: {u.fullName} ({u.email})</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Hủy bỏ</Button>
            <Button type="submit" busy={creating}>{creating ? 'Đang tạo…' : 'Xuất xưởng & tạo mã'}</Button>
          </div>
        </form>
      </Drawer>

      {/* ADMIN DRAWER: Xem API Key 1 lần */}
      <Drawer open={isAdmin && showCredentialModal} onClose={() => setShowCredentialModal(false)} title={credentialInfo.isNew ? 'Hồ sơ xuất xưởng thiết bị' : 'API Key mới'} description={`${credentialInfo.deviceName} · ${credentialInfo.deviceCode}`}>
        <div className="form-stack">
          <Notice tone="warning"><strong>API Key chỉ hiển thị một lần.</strong> Nạp chuỗi này vào ESP32 hoặc dùng khi chạy Simulator.</Notice>
          {credentialInfo.claimPin && (
            <div className="rounded-[6px] border border-[#dde2d6] bg-[#f8f8f3] p-4 space-y-2 text-sm">
              <div>Mã thiết bị: <strong className="mono-tabular">{credentialInfo.deviceCode}</strong></div>
              <div>PIN kích hoạt: <strong className="mono-tabular text-[#3f6044]">{credentialInfo.claimPin}</strong></div>
            </div>
          )}
          <Field label="API Key (x-api-key)" htmlFor="device-api-key">
            <textarea id="device-api-key" readOnly value={credentialInfo.apiKey} rows={2} className="w-full resize-none break-all font-mono text-sm" />
          </Field>
          <Button variant="secondary" onClick={() => copyText(credentialInfo.apiKey, 'apiKey')}>
            {copiedField === 'apiKey' ? <Check size={16} /> : <Copy size={16} />}
            <span>{copiedField === 'apiKey' ? 'Đã sao chép API Key' : 'Sao chép API Key'}</span>
          </Button>
          <Button onClick={() => setShowCredentialModal(false)}>Tôi đã lưu, đóng bảng</Button>
        </div>
      </Drawer>

      {/* DRAWER ĐỔI TÊN TRẠM */}
      <Drawer open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} title="Đổi tên trạm đo" description={renameTarget?.device_code || ''}>
        {renameTarget && (
          <form onSubmit={handleRenameSubmit} className="form-stack">
            {renameError && <Notice tone="error">{renameError}</Notice>}
            <Field label="Tên hiển thị mới *" htmlFor="rename-device-input">
              <input id="rename-device-input" type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus required />
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setRenameTarget(null)}>Hủy bỏ</Button>
              <Button type="submit" busy={renaming}>{renaming ? 'Đang lưu…' : 'Lưu tên mới'}</Button>
            </div>
          </form>
        )}
      </Drawer>

      {/* ADMIN DRAWER: Bàn giao chủ sở hữu */}
      <Drawer open={isAdmin && Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title="Bàn giao thiết bị" description={assignTarget ? `${assignTarget.name} · ${assignTarget.device_code}` : ''}>
        {assignTarget && (
          <form onSubmit={handleAssignSubmit} className="form-stack">
            {assignError && <Notice tone="error">{assignError}</Notice>}
            <Field label="Chọn chủ sở hữu" htmlFor="assign-owner-select">
              <select id="assign-owner-select" value={assignOwnerId} onChange={(e) => setAssignOwnerId(e.target.value)}>
                <option value="">Thu hồi về kho (Chờ kích hoạt lại)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName} ({u.email}) — {u.role === 'admin' ? 'Quản trị viên' : 'Nông dân'}</option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap justify-end gap-3 border-t border-[#dde2d6] pt-5">
              <Button variant="secondary" onClick={() => setAssignTarget(null)}>Hủy bỏ</Button>
              <Button type="submit" busy={assigning}>{assigning ? 'Đang cập nhật…' : 'Xác nhận bàn giao'}</Button>
            </div>
          </form>
        )}
      </Drawer>
    </div>
  );
}
