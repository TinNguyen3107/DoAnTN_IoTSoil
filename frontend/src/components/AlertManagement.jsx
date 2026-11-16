import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Radio, Smartphone, RefreshCw, Check, CheckCheck } from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState } from './UI.jsx';

export default function AlertManagement({ unreadCount, alertsVersion = 0, onAlertResolved }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [actionError, setActionError] = useState('');
  const [filterMode, setFilterMode] = useState('unresolved');
  const [resolvingId, setResolvingId] = useState(null);
  const [actionNotes, setActionNotes] = useState({});

  // UC-12 Step 2 & 3: tải danh sách cảnh báo
  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setFetchError('');
      const unreadParam = filterMode === 'unresolved' ? '?unreadOnly=true' : '';
      const res = await axios.get(`/api/alerts${unreadParam}`);
      if (res.data?.success) {
        setAlerts(res.data.data);
      } else {
        setFetchError('Máy chủ không trả về danh sách cảnh báo.');
      }
    } catch (err) {
      setFetchError('Không tải được danh sách cảnh báo. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filterMode, alertsVersion]);

  // UC-13 Step 1: xác nhận từng cảnh báo kèm ghi chú biện pháp
  const handleResolveOne = async (alertId) => {
    const note = actionNotes[alertId] || 'Đã kiểm tra thực địa và xử lý nông học';
    try {
      setResolvingId(alertId);
      setActionError('');
      const res = await axios.patch(`/api/alerts/${alertId}/resolve`, { actionTaken: note });
      if (res.data?.success) {
        await fetchAlerts();
        onAlertResolved?.();
      } else {
        setActionError('Chưa ghi nhận được biện pháp xử lý.');
      }
    } catch (err) {
      setActionError(err.response?.data?.message || 'Lỗi khi xử lý cảnh báo.');
    } finally {
      setResolvingId(null);
    }
  };

  // UC-13 Step 1a: xác nhận toàn bộ
  const handleResolveAll = async () => {
    if (!window.confirm('Xác nhận đánh dấu TẤT CẢ các cảnh báo hiện tại là đã xử lý?')) return;
    try {
      setLoading(true);
      setActionError('');
      const res = await axios.patch('/api/alerts/resolve-all');
      if (res.data?.success) {
        await fetchAlerts();
        onAlertResolved?.();
      } else {
        setActionError('Chưa xác nhận được toàn bộ cảnh báo.');
      }
    } catch (err) {
      setActionError('Lỗi khi xử lý toàn bộ cảnh báo.');
    } finally {
      setLoading(false);
    }
  };

  const unresolvedCount = typeof unreadCount === 'number' ? unreadCount : alerts.filter(a => !a.isResolved).length;

  const filterClass = (active) =>
    `px-4 py-2 rounded-full text-xs border transition-colors ${
      active
        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
        : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--soft)]'
    }`;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cảnh báo vượt ngưỡng"
        title="Những gì cần được nhìn lại."
        description="Mỗi lần một thông số vượt dải ngưỡng đã cấu hình, hệ thống ghi lại cảnh báo kèm thời điểm đo để bạn đối chiếu và xác nhận biện pháp xử lý."
        actions={
          <>
            {unresolvedCount > 0 && (
              <Button variant="secondary" onClick={handleResolveAll}><CheckCheck size={16} />Xác nhận toàn bộ</Button>
            )}
            <Button variant="ghost" onClick={fetchAlerts} busy={loading}>
              {!loading && <RefreshCw size={16} />}{loading ? 'Đang tải' : 'Tải lại'}
            </Button>
          </>
        }
      />

      {fetchError && <Notice tone="error">{fetchError}</Notice>}
      {actionError && <Notice tone="warning">{actionError}</Notice>}

      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={filterClass(filterMode === 'unresolved')} aria-pressed={filterMode === 'unresolved'} onClick={() => setFilterMode('unresolved')}>
            Chưa xử lý <span className="tabular-nums">({unresolvedCount})</span>
          </button>
          <button type="button" className={filterClass(filterMode === 'all')} aria-pressed={filterMode === 'all'} onClick={() => setFilterMode('all')}>
            Tất cả cảnh báo{filterMode === 'all' && <span className="tabular-nums"> ({alerts.length})</span>}
          </button>
        </div>
        <p className="muted text-xs">Cảnh báo được tạo tự động khi có số đo mới vượt ngưỡng, không cần thao tác quét thủ công.</p>
      </div>

      {loading && alerts.length === 0 ? (
        <EmptyState loading title="Đang tải cảnh báo" description="Đọc danh sách cảnh báo từ máy chủ." />
      ) : fetchError ? (
        <EmptyState title="Chưa hiển thị được danh sách" description="Kiểm tra kết nối máy chủ rồi bấm Tải lại." action={<Button variant="secondary" onClick={fetchAlerts}>Thử lại</Button>} />
      ) : alerts.length === 0 ? (
        <EmptyState
          title={filterMode === 'unresolved' ? 'Không còn cảnh báo chưa xử lý' : 'Chưa có bản ghi cảnh báo nào'}
          description={filterMode === 'unresolved'
            ? 'Toàn bộ cảnh báo đã được xác nhận. Số đo mới nhất vẫn cần xem ở trang Giám sát để đối chiếu.'
            : 'Hệ thống sẽ ghi cảnh báo ngay khi một thông số vượt dải ngưỡng đã cấu hình.'}
        />
      ) : (
        <div className="panel py-0">
          {alerts.map(alert => {
            const isDanger = alert.level === 'danger';
            const isResolved = alert.isResolved;
            return (
              <article key={alert.id} className="py-6 border-b border-[var(--line)] last:border-b-0">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={isResolved ? 'neutral' : isDanger ? 'danger' : 'warning'}>
                        {isResolved ? 'Đã xử lý' : isDanger ? 'Nguy hiểm' : 'Cảnh báo'}
                      </Badge>
                      <span className="font-medium">{alert.parameterName}</span>
                      <span className="tabular-nums">{alert.value} {alert.unit}</span>
                      <span className="muted text-xs tabular-nums">ngưỡng {alert.limitValue} {alert.unit}</span>
                    </div>
                    <p className="text-sm mt-3 leading-relaxed max-w-2xl">{alert.diagnosticMessage}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 muted text-xs mt-3">
                      <span className="inline-flex items-center gap-1.5">
                        {alert.deviceType === 'fixed' ? <Radio size={13} /> : <Smartphone size={13} />}
                        {alert.deviceName}
                      </span>
                      <time className="tabular-nums" dateTime={alert.createdAt}>
                        {new Date(alert.createdAt).toLocaleString('vi-VN')}
                      </time>
                      {Boolean(isResolved) && alert.actionTaken && (
                        <span className="text-[var(--green)]">Biện pháp: {alert.actionTaken}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {!isResolved ? (
                      <>
                        <label className="sr-only" htmlFor={`alert-note-${alert.id}`}>Ghi chú biện pháp xử lý</label>
                        <input
                          id={`alert-note-${alert.id}`}
                          type="text"
                          placeholder="Ghi chú biện pháp xử lý..."
                          value={actionNotes[alert.id] || ''}
                          onChange={e => setActionNotes({ ...actionNotes, [alert.id]: e.target.value })}
                          disabled={resolvingId === alert.id}
                        />
                        <Button onClick={() => handleResolveOne(alert.id)} busy={resolvingId === alert.id} className="lg:self-end">
                          {resolvingId !== alert.id && <Check size={16} />}Đã xử lý
                        </Button>
                      </>
                    ) : (
                      <span className="badge badge-success self-start"><Check size={13} />Đã xác nhận</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
