import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, RefreshCw, Radio, Smartphone, Sprout } from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState, Field, Drawer } from './UI.jsx';

const toLocalDateStr = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? String(dateStr) : parsed.toLocaleDateString('vi-VN');
};

export default function FieldLogs({ devices = [] }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStationFilter, setSelectedStationFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [formDeviceId, setFormDeviceId] = useState('');
  const [formEventType, setFormEventType] = useState('Bón thúc');
  const [formAmount, setFormAmount] = useState('');
  const [formUnit, setFormUnit] = useState('kg/sào');
  const [formDate, setFormDate] = useState(() => toLocalDateStr());
  const [formNotes, setFormNotes] = useState('');
  const [loadError, setLoadError] = useState('');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const url = selectedStationFilter === 'all'
        ? '/api/field-events'
        : `/api/field-events?deviceId=${selectedStationFilter}`;
      const res = await axios.get(url);
      if (res.data?.success) {
        setEvents(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi tải nhật ký canh tác:', err);
      setLoadError(err.response?.data?.message || 'Không thể tải nhật ký canh tác. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedStationFilter]);

  useEffect(() => {
    if (devices.length > 0) {
      const exists = devices.some(d => String(d.id) === String(formDeviceId));
      if (!formDeviceId || !exists) {
        setFormDeviceId(String(devices[0].id));
      }
    } else {
      setFormDeviceId('');
    }
  }, [devices]);

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    setModalError('');
    if (!formDeviceId) {
      setModalError('Vui lòng chọn trạm đo / vị trí lô đất áp dụng.');
      return;
    }
    if (!formAmount || parseFloat(formAmount) <= 0) {
      setModalError('Liều lượng phải là một số lớn hơn 0.');
      return;
    }
    const today = toLocalDateStr();
    if (formDate > today) {
      setModalError('Ngày thực hiện canh tác không hợp lệ: Không được chọn mốc thời gian ở tương lai.');
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        deviceId: Number(formDeviceId),
        eventType: formEventType,
        amount: parseFloat(formAmount),
        unit: formUnit,
        eventDate: formDate,
        notes: formNotes
      };
      const res = await axios.post('/api/field-events', payload);
      if (res.data?.success) {
        setShowAddModal(false);
        setFormAmount('');
        setFormNotes('');
        setFormDate(toLocalDateStr());
        fetchEvents();
      }
    } catch (err) {
      setModalError(err.response?.data?.message || 'Có lỗi xảy ra khi lưu sự kiện canh tác.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (id, eventType, date) => {
    const formattedDate = formatDisplayDate(date);
    if (!window.confirm(`Xác nhận xóa sự kiện "${eventType}" ngày ${formattedDate}?\nThao tác này sẽ gỡ bỏ cọc mốc tương ứng trên biểu đồ lịch sử biến thiên.`)) {
      return;
    }
    try {
      setLoadError('');
      const res = await axios.delete(`/api/field-events/${id}`);
      if (res.data?.success) {
        fetchEvents();
      }
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Lỗi khi xóa sự kiện.');
    }
  };

  const getBadgeStyle = (type) => {
    if (type.includes('Bón vôi') || type.includes('Khử chua')) {
      return 'bg-[#f4e9dd] text-[#9a633b] border-[#e4cbb1]';
    }
    if (type.includes('Rửa mặn') || type.includes('Tưới')) {
      return 'bg-[#e5efeb] text-[#456e64] border-[#c8dad2]';
    }
    if (type.includes('Bón lót')) {
      return 'bg-[#f0efe5] text-[#777344] border-[#dbdac6]';
    }
    return 'bg-[#eaf0e3] text-[#3f6044] border-[#d3deca]';
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Nhật ký canh tác"
        title="Ghi lại việc chăm vườn."
        description="Lưu những lần bón phân, tưới tiêu và cải tạo đất để đối chiếu với sự thay đổi của đất theo thời gian."
        actions={<Button onClick={() => { setShowAddModal(true); setModalError(''); setFormDate(toLocalDateStr()); }}><Plus size={17} />Ghi nhật ký</Button>}
      />
      <div className="toolbar border-b border-[#dde2d6] pb-5">
        <Field label="Lọc theo trạm" htmlFor="logs-station-filter" className="w-full sm:max-w-sm">
          <select id="logs-station-filter" className="w-full" value={selectedStationFilter} onChange={(e) => setSelectedStationFilter(e.target.value)}>
            <option value="all">Tất cả các trạm ({devices.length} trạm)</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.type === 'fixed' ? 'Cố định' : 'Cầm tay'})</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto sm:self-end">
          <Badge>{events.length} sự kiện</Badge>
          <Button variant="secondary" onClick={fetchEvents} busy={loading}>{!loading && <RefreshCw size={16} />}Làm mới</Button>
        </div>
      </div>
      {loadError && <Notice tone="error">{loadError}</Notice>}
      <section aria-labelledby="logs-timeline-title" aria-busy={loading}>
        <div className="section-head"><div><p className="eyebrow">Những việc đã làm</p><h2 id="logs-timeline-title">Dòng thời gian canh tác</h2></div></div>
        {loading ? (
          <EmptyState loading title="Đang tải nhật ký…" description="Đang lấy các sự kiện canh tác của trạm đã chọn." />
        ) : loadError && events.length === 0 ? (
          <EmptyState title="Chưa tải được nhật ký" description="Làm mới để thử tải lại dữ liệu." action={<Button variant="secondary" onClick={fetchEvents}>Thử lại</Button>} />
        ) : events.length === 0 ? (
          <EmptyState title="Chưa có ghi chép canh tác" description="Ghi lại đợt bón phân hoặc cải tạo đất đầu tiên cho trạm của bạn." action={<Button onClick={() => { setShowAddModal(true); setModalError(''); setFormDate(toLocalDateStr()); }}><Plus size={16} />Ghi nhật ký</Button>} />
        ) : (
          <ol className="ml-4 mt-5">
            {events.map((evt) => (
              <li key={evt.id} className="relative grid gap-3 border-l border-[#c8d4c1] pb-7 pl-8 sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-6 sm:pl-10">
                <span className={`absolute -left-4 top-1 flex h-8 w-8 items-center justify-center rounded-full border ${getBadgeStyle(evt.eventType)}`} aria-hidden="true"><Sprout size={16} /></span>
                <time dateTime={evt.eventDate} className="pt-2 text-sm font-medium tabular-nums text-[#68766a]">{formatDisplayDate(evt.eventDate)}</time>
                <article className="min-w-0 border-b border-[#dde2d6] pb-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-serif text-2xl text-[#213c32]">{evt.eventType}</h3>
                      <div className="mt-2 flex items-center gap-2 text-sm text-[#68766a]">
                        {evt.deviceType === 'fixed' ? <Radio size={15} className="shrink-0" /> : <Smartphone size={15} className="shrink-0" />}
                        <span className="break-words">{evt.deviceName} · {evt.deviceType === 'fixed' ? 'Cố định' : 'Cầm tay'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-semibold tabular-nums text-[#3f6044]">{evt.amount} <span className="text-sm font-normal text-[#68766a]">{evt.unit}</span></p>
                      <Button variant="ghost" onClick={() => handleDeleteEvent(evt.id, evt.eventType, evt.eventDate)} aria-label={`Xóa sự kiện ${evt.eventType} ngày ${formatDisplayDate(evt.eventDate)}`} title="Xóa sự kiện nhập sai"><Trash2 size={16} /></Button>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap break-words leading-relaxed text-[#68766a]">{evt.notes || '—'}</p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>
      <Notice>Mốc nhật ký sẽ xuất hiện trên biểu đồ lịch sử khi có số đo tương ứng với ngày thực hiện. Xóa sự kiện cũng sẽ gỡ mốc khỏi biểu đồ.</Notice>
      <Drawer open={showAddModal} onClose={() => setShowAddModal(false)} title="Ghi nhật ký" description="Ghi nhận lượng thực tế đã sử dụng trên lô đất.">
        <form onSubmit={handleCreateEvent} className="form-stack">
          {modalError && <Notice tone="error">{modalError}</Notice>}
          {devices.length === 0 && <Notice tone="warning">Chưa có trạm đo. Cần có trạm đo để lưu nhật ký canh tác.</Notice>}
          <Field label="Trạm đo / Lô đất áp dụng *" htmlFor="log-device">
            <select id="log-device" value={formDeviceId} onChange={(e) => setFormDeviceId(e.target.value)} required>
              {devices.length === 0 && <option value="">Chưa có trạm đo nào</option>}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.type === 'fixed' ? 'Trạm cố định' : 'Cầm tay dã ngoại'})</option>
              ))}
            </select>
          </Field>
          <Field label="Hoạt động canh tác *" htmlFor="log-event-type">
            <select id="log-event-type" value={formEventType} onChange={(e) => setFormEventType(e.target.value)}>
              <option value="Bón thúc">Bón thúc (Đón đòng / Ra hoa)</option>
              <option value="Bón thúc nuôi quả">Bón thúc nuôi củ / Nuôi quả</option>
              <option value="Bón lót">Bón lót (Đầu vụ / Cày ải)</option>
              <option value="Bón vôi khử chua">Bón vôi khử chua / Nâng pH</option>
              <option value="Rửa mặn / Xả phèn">Rửa mặn / Xả phèn</option>
              <option value="Tưới ẩm giữ ẩm">Tưới ẩm / Điều tiết nước</option>
              <option value="Phun phân bón lá">Phun phân bón lá / Vi lượng</option>
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Lượng đã dùng *" htmlFor="log-amount" hint="Liều lượng phải lớn hơn 0.">
              <input id="log-amount" type="number" step="0.1" min="0.1" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="VD: 25.0" required />
            </Field>
            <Field label="Đơn vị tính *" htmlFor="log-unit">
              <select id="log-unit" value={formUnit} onChange={(e) => setFormUnit(e.target.value)}>
                <option value="kg/sào">kg / sào (Bắc Bộ / Trung Bộ)</option>
                <option value="kg/ha">kg / ha</option>
                <option value="tấn/ha">tấn / ha</option>
                <option value="lít/ha">lít / ha (Phân nước)</option>
                <option value="bao">bao</option>
              </select>
            </Field>
          </div>
          <Field label="Ngày thực hiện *" htmlFor="log-date" hint="Chọn ngày hôm nay hoặc một ngày trong quá khứ.">
            <input id="log-date" type="date" max={toLocalDateStr()} value={formDate} onChange={(e) => setFormDate(e.target.value)} required />
          </Field>
          <Field label="Tên phân bón / Ghi chú kỹ thuật" htmlFor="log-notes">
            <textarea id="log-notes" rows={4} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="VD: Phân NPK 16-16-8 Đầu Trâu kết hợp tưới đẫm" />
          </Field>
          <Notice>Mốc nhật ký sẽ được đồng bộ lên biểu đồ dinh dưỡng đất.</Notice>
          <div className="flex flex-wrap gap-3 border-t border-[#dde2d6] pt-5">
            <Button type="submit" busy={submitting} disabled={submitting || !formDeviceId}>{submitting ? 'Đang lưu…' : 'Lưu nhật ký'}</Button>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Hủy bỏ</Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
