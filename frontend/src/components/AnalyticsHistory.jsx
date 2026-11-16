import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Download,
  RefreshCw,
  Sprout,
  ChevronDown,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { PageHeader, Button, Badge, Notice, EmptyState, Field } from './UI.jsx';

const SERIES = [
  { key: 'n', label: 'Đạm (N)', short: 'N', unit: 'mg/kg', color: '#3f6044', axis: 'left', name: 'Đạm (N)' },
  { key: 'p', label: 'Lân (P)', short: 'P', unit: 'mg/kg', color: '#4a7ba7', axis: 'left', name: 'Lân (P)' },
  { key: 'k', label: 'Kali (K)', short: 'K', unit: 'mg/kg', color: '#7a5d8f', axis: 'left', name: 'Kali (K)' },
  { key: 'ec', label: 'EC', short: 'EC', unit: 'µS/cm', color: '#a14331', axis: 'left', name: 'Độ dẫn điện (EC)' },
  { key: 'ph', label: 'pH', short: 'pH', unit: '', color: '#b56743', axis: 'right', name: 'Độ chua (pH)' },
  { key: 'temperature', label: 'Nhiệt độ', short: 'Nhiệt', unit: '°C', color: '#c97a3d', axis: 'right', name: 'Nhiệt độ (°C)' },
  { key: 'moisture', label: 'Độ ẩm', short: 'Ẩm', unit: '%', color: '#456e64', axis: 'right', name: 'Độ ẩm (%)' },
];

const PRESETS = [
  { id: '24h', label: '24 giờ' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'custom', label: 'Tùy chọn' },
];

const toLocalDateStr = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toShortDate = (isoDate) => {
  if (!isoDate || isoDate.length < 10) return '';
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
};

const matchesEventReading = (reading, evt) => {
  if (!reading || !evt?.eventDate) return false;
  if (reading.isoDate && reading.isoDate === evt.eventDate) return true;
  const shortDate = toShortDate(evt.eventDate);
  return reading.dateOnly === shortDate || Boolean(shortDate && reading.timeLabel?.includes(shortDate));
};

export default function AnalyticsHistory({ devices = [] }) {
  // Trạng thái trạm đo được chọn
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // Trạng thái khoảng thời gian lọc (24h, 7d, 30d, custom)
  const [datePreset, setDatePreset] = useState('7d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Trạng thái dữ liệu lịch sử
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Bật/tắt từng đường chỉ số (Quy tắc nghiệp vụ US-10: Checkbox toggle)
  const [visibleSeries, setVisibleSeries] = useState({
    n: true,
    p: true,
    k: true,
    ph: false,
    ec: false,
    temperature: false,
    moisture: false
  });

  // Tự động khởi tạo khoảng thời gian theo preset (theo ngày địa phương)
  const applyPreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    const to = toLocalDateStr(now);

    if (preset === 'custom') {
      if (!fromDate || !toDate) {
        const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        setFromDate(toLocalDateStr(past));
        setToDate(to);
      }
      return;
    }

    let from = '';
    if (preset === '24h') {
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      from = toLocalDateStr(past);
    } else if (preset === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      from = toLocalDateStr(past);
    } else if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      from = toLocalDateStr(past);
    }

    setFromDate(from);
    setToDate(to);
  };

  // Khởi tạo / đồng bộ trạm đo mặc định khi danh sách trạm thay đổi
  useEffect(() => {
    if (devices.length > 0) {
      const exists = devices.some(d => String(d.id) === String(selectedDeviceId));
      if (!selectedDeviceId || !exists) {
        setSelectedDeviceId(String(devices[0].id));
      }
    } else {
      setSelectedDeviceId('');
      setHistoryData(null);
    }
  }, [devices]);

  useEffect(() => {
    applyPreset('7d');
  }, []);

  // Tải dữ liệu lịch sử biến thiên (UC-10 Step 2, 3, 4, 5)
  const fetchHistory = async () => {
    if (!selectedDeviceId) return;
    if (fromDate && toDate && fromDate > toDate) {
      setErrorMessage('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');

      let url = `/api/readings/history?deviceId=${selectedDeviceId}`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;

      const res = await axios.get(url);
      if (res.data?.success) {
        setHistoryData(res.data.data);
      }
    } catch (err) {
      console.error('Lỗi nạp dữ liệu lịch sử:', err);
      setHistoryData(null);
      setErrorMessage(err.response?.data?.message || 'Không thể tải dữ liệu lịch sử biến thiên.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setHistoryData(null);
    setErrorMessage('');
    if (selectedDeviceId && fromDate && toDate) {
      fetchHistory();
    }
  }, [selectedDeviceId, datePreset]);

  // Xử lý Xuất báo cáo CSV UTF-8 BOM (UC-11)
  const handleExportCsv = async () => {
    if (!selectedDeviceId) return;
    if (!historyData || historyData.totalReadings === 0) return;

    try {
      setExporting(true);
      let url = `/api/readings/export-csv?deviceId=${selectedDeviceId}`;
      if (fromDate) url += `&fromDate=${fromDate}`;
      if (toDate) url += `&toDate=${toDate}`;

      const res = await axios.get(url, { responseType: 'blob' });

      // Lấy tên tệp từ header Content-Disposition hoặc đặt tên mặc định
      const disposition = res.headers['content-disposition'];
      let filename = `BaoCao_SoDo_${selectedDeviceId}_${fromDate}_${toDate}.csv`;
      if (disposition && disposition.includes('filename=')) {
        const matches = disposition.match(/filename="?([^"]+)"?/);
        if (matches && matches[1]) filename = matches[1];
      }

      // Kích hoạt trình duyệt tải tệp về máy
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      let msg = 'Có lỗi xảy ra khi xuất báo cáo CSV.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed?.message) msg = parsed.message;
        } catch {
          // Bỏ qua nếu Blob không phải JSON
        }
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      setErrorMessage(msg);
    } finally {
      setExporting(false);
    }
  };

  const toggleSeries = (key) => {
    setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedDevice = devices.find(d => String(d.id) === String(selectedDeviceId));
  const readings = historyData?.readings || [];
  const events = historyData?.events || [];
  const summary = historyData?.summary;
  const hasReadings = readings.length > 0;
  const visibleCount = SERIES.filter(s => visibleSeries[s.key]).length;

  // Tooltip tùy biến chi tiết (Quy tắc US-10: Hover hiện 7 thông số và sự kiện bón phân)
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const currentPoint = payload[0]?.payload;
    const matchingEvents = events.filter(e => matchesEventReading(currentPoint, e));

    return (
      <div className="panel p-3.5 text-xs space-y-2 min-w-[230px] shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-1.5">
          <span className="tabular-nums text-[var(--muted)]">{currentPoint?.timeLabel || label}</span>
          <Badge tone="neutral">{currentPoint?.mode === 'auto' ? 'Tự động' : 'Cầm tay'}</Badge>
        </div>

        {/* Các thông số đang bật */}
        <div className="space-y-1">
          {payload.map((item) => {
            const cfg = SERIES.find(c => c.key === item.dataKey);
            return (
              <div key={item.dataKey} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-[var(--muted)]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }}></span>
                  <span>{item.name}</span>
                </span>
                <span className="tabular-nums font-semibold">
                  {item.value}{cfg?.unit ? ` ${cfg.unit}` : ''}
                </span>
              </div>
            );
          })}
        </div>

        {/* Gắn cọc mốc sự kiện canh tác nếu có */}
        {matchingEvents.length > 0 && (
          <div className="pt-2 border-t border-[var(--line)] space-y-2">
            {matchingEvents.map((matchingEvent) => (
              <div key={matchingEvent.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--green)' }}>
                  <Sprout size={14} />
                  <span>{matchingEvent.eventType}{matchingEvent.amount ? ` (${matchingEvent.amount} ${matchingEvent.unit})` : ''}</span>
                </div>
                {matchingEvent.notes && (
                  <p className="text-[11px] text-[var(--muted)] leading-snug">{matchingEvent.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (devices.length === 0) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Lịch sử và báo cáo"
          title="Chưa có trạm để phân tích."
          description="Biểu đồ biến thiên và tệp CSV được dựng từ chuỗi số đo của một trạm cụ thể."
          illustration
        />
        <EmptyState
          title="Danh sách trạm đang trống"
          description="Sau khi kích hoạt trạm và nhận số đo, chuỗi lịch sử của trạm sẽ xuất hiện tại đây."
        />
      </div>
    );
  }

  const chipClass = (active) =>
    `px-4 py-2 rounded-full text-xs border transition-colors inline-flex items-center gap-2 ${
      active
        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
        : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--soft)]'
    }`;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Lịch sử và báo cáo"
        title="Diễn biến đất theo thời gian."
        description="Chuỗi số đo của trạm được vẽ lại theo từng lần lấy mẫu, có đánh dấu các đợt bón phân để đối chiếu phản ứng của đất. Tệp xuất CSV giữ nguyên toàn bộ bản ghi gốc."
        illustration
        actions={
          <Button
            variant="secondary"
            onClick={handleExportCsv}
            busy={exporting}
            disabled={!hasReadings}
            title={!hasReadings ? 'Khoảng thời gian đang chọn chưa có bản ghi nào để xuất' : 'Xuất dữ liệu CSV mở được bằng Excel'}
          >
            {!exporting && <Download size={16} />}
            {exporting ? 'Đang kết xuất' : 'Xuất báo cáo CSV'}
          </Button>
        }
      />

      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={chipClass(datePreset === preset.id)}
              aria-pressed={datePreset === preset.id}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Field label="Trạm quan trắc" htmlFor="an-device" className="min-w-[240px] max-w-xs">
          <div className="relative">
            <select id="an-device" value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} className="w-full appearance-none pr-9">
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {d.type === 'fixed' ? 'Cố định' : 'Cầm tay'}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
          </div>
        </Field>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Từ ngày" htmlFor="an-from" className="w-[170px]">
              <input id="an-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="Đến ngày" htmlFor="an-to" className="w-[170px]">
              <input id="an-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
            <Button variant="ghost" onClick={fetchHistory} busy={loading}>
              {!loading && <RefreshCw size={16} />}
              {loading ? 'Đang nạp' : 'Áp dụng khoảng ngày'}
            </Button>
          </div>
          <p className="muted text-xs tabular-nums">
            {selectedDevice ? `Khoảng đang xem: ${fromDate} → ${toDate} · trạm ${selectedDevice.name}` : 'Chọn khoảng ngày để xem.'}
          </p>
        </div>
        {datePreset !== 'custom' && (
          <p className="muted text-[11px] mt-3">
            Ngày trong khoảng được tính nhanh theo preset; chỉnh lại ô ngày nếu bạn muốn xem một mốc khác.
          </p>
        )}
      </div>

      {errorMessage && <Notice tone="error">{errorMessage}</Notice>}

      {historyData?.isDownsampled && (
        <Notice tone="info">
          Khoảng thời gian chứa <strong>{historyData.totalReadings}</strong> số đo. Để vẽ nhanh, biểu đồ dùng mẫu trung bình đã gộp; tệp CSV xuất ra vẫn giữ đủ 100% bản ghi gốc.
        </Notice>
      )}

      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <span className="muted text-xs font-semibold flex items-center gap-2 mr-1"><Layers size={14} /> Đường biểu diễn</span>
          {SERIES.map((cfg) => {
            const on = visibleSeries[cfg.key];
            return (
              <button
                key={cfg.key}
                type="button"
                onClick={() => toggleSeries(cfg.key)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  on ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]' : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--soft)]'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: on ? cfg.color : '#c9d2c2' }}></span>
                <span className={on ? 'font-semibold' : ''}>{cfg.label}</span>
              </button>
            );
          })}
        </div>
        <p className="muted text-[11px]">
          Bấm để bật hoặc ẩn từng đường. Trục trái dùng mg/kg và µS/cm, trục phải dùng pH, °C và %.
        </p>
      </div>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="text-lg">Biểu đồ biến thiên</h2>
            <p>Mỗi điểm là một lần trạm gửi số đo; đường đứt dọc là đợt bón phân ghi trong nhật ký canh tác.</p>
          </div>
          {events.length > 0 && <Badge tone="success"><Sprout size={12} /> {events.length} đợt bón phân</Badge>}
        </div>

        <div className="h-80 w-full pt-2">
          {loading ? (
            <EmptyState loading title="Đang nạp chuỗi số đo" description="Đọc lịch sử lấy mẫu của trạm theo khoảng ngày đã chọn." />
          ) : !hasReadings ? (
            <EmptyState
              title="Khoảng thời gian này chưa có số đo"
              description="Chọn khoảng ngày khác, hoặc kiểm tra trạm đã gửi dữ liệu lên hệ thống hay chưa."
              action={<Button variant="secondary" onClick={fetchHistory} disabled={!selectedDeviceId}>Nạp lại dữ liệu</Button>}
            />
          ) : visibleCount === 0 ? (
            <EmptyState
              title="Đang ẩn hết các đường biểu diễn"
              description="Bật lại ít nhất một thông số phía trên để nhìn thấy diễn biến."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={readings} margin={{ top: 12, right: 18, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde2d6" vertical={false} />

                <XAxis
                  dataKey="timeLabel"
                  stroke="#68766a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#dde2d6' }}
                />

                {/* Trục Y bên trái: N, P, K, EC */}
                <YAxis
                  yAxisId="left"
                  stroke="#68766a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#dde2d6' }}
                  domain={[0, 'auto']}
                />

                {/* Trục Y bên phải: pH, Nhiệt độ, Độ ẩm */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#68766a"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: '#dde2d6' }}
                  domain={[(dataMin) => Math.min(0, Math.floor(dataMin)), (dataMax) => Math.max(100, Math.ceil(dataMax))]}
                />

                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '14px', color: '#68766a' }} />

                {/* Các đường chỉ số được cấu hình bật/tắt */}
                {SERIES.map((cfg, idx) => visibleSeries[cfg.key] && (
                  <Line
                    key={cfg.key}
                    yAxisId={cfg.axis}
                    type="monotone"
                    dataKey={cfg.key}
                    name={cfg.name}
                    stroke={cfg.color}
                    strokeWidth={idx < 3 ? 2.2 : 1.8}
                    strokeDasharray={cfg.axis === 'right' && idx > 4 ? '4 4' : undefined}
                    dot={cfg.axis === 'left' ? { r: 3 } : false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                ))}

                {/* Vẽ các cọc mốc dọc đánh dấu sự kiện bón phân (UC-10 Step 6) */}
                {events.map((evt) => {
                  const matchingReading = readings.find(r => matchesEventReading(r, evt));
                  if (!matchingReading) return null;

                  return (
                    <ReferenceLine
                      key={evt.id}
                      x={matchingReading.timeLabel}
                      yAxisId="left"
                      stroke="#b56743"
                      strokeDasharray="3 3"
                      strokeWidth={1.5}
                      label={{
                        value: evt.eventType,
                        position: 'top',
                        fill: '#b56743',
                        fontSize: 10,
                        fontWeight: 'bold'
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {hasReadings && summary && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2 className="text-lg">Tóm tắt khoảng dữ liệu</h2>
              <p>Trung bình, giá trị nhỏ nhất và lớn nhất tính trên {historyData.totalReadings ?? readings.length} bản ghi đang xem.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Thông số</th>
                  <th className="text-right">Trung bình</th>
                  <th className="text-right">Thấp nhất</th>
                  <th className="text-right">Cao nhất</th>
                  <th className="text-right">Gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {SERIES.map((cfg) => {
                  const row = summary[cfg.key];
                  if (!row) return null;
                  return (
                    <tr key={cfg.key}>
                      <td>
                        <span className="inline-flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }}></span>
                          <span className="font-semibold">{cfg.label}</span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums font-semibold">{row.avg}{cfg.unit ? ` ${cfg.unit}` : ''}</td>
                      <td className="text-right tabular-nums muted">{row.min}</td>
                      <td className="text-right tabular-nums muted">{row.max}</td>
                      <td className="text-right tabular-nums muted">{row.latest}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
