import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Radio, Smartphone, RefreshCw, Clock, Thermometer, Droplets, Activity } from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState, Field } from './UI.jsx';

const DEFAULT_LIMITS = {
  ph: { low: 5.5, high: 7.0 },
  ec: { low: 300, high: 1200 },
  n: { low: 50, high: 150 },
  p: { low: 30, high: 80 },
  k: { low: 80, high: 200 },
  temperature: { low: 18, high: 35 },
  moisture: { low: 50, high: 80 },
};

const hasMetric = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));
const metricValue = value => hasMetric(value) ? value : '—';
const formatTime = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN') : 'Chưa có thời điểm';

function MetricRail({ label, value, referenceMin, referenceMax, scaleMin = 0, scaleMax, warning = false }) {
  const available = hasMetric(value);
  const numeric = available ? Number(value) : null;
  const min = Math.min(scaleMin, referenceMin, numeric ?? scaleMin);
  const max = Math.max(scaleMax, referenceMax, numeric ?? scaleMax);
  const span = max - min || 1;
  const position = number => ((number - min) / span) * 100;

  return (
    <div className="mt-4 min-w-0 px-1.5">
      <div
        className="relative h-2 rounded-full bg-[var(--line)]"
        role={available ? 'meter' : 'img'}
        aria-label={available ? label : `${label}: chưa có số đo`}
        aria-valuemin={available ? min : undefined}
        aria-valuemax={available ? max : undefined}
        aria-valuenow={available ? numeric : undefined}
        aria-valuetext={available ? `${value}; ngưỡng áp dụng ${referenceMin} – ${referenceMax}` : undefined}
      >
        <span className="absolute inset-y-0 rounded-full bg-[var(--green)] opacity-30" style={{ left: `${position(referenceMin)}%`, width: `${position(referenceMax) - position(referenceMin)}%` }} />
        {available && <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--paper)] ${warning ? 'bg-[var(--clay)]' : 'bg-[var(--green)]'}`} style={{ left: `${position(numeric)}%` }} />}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs tabular-nums text-[var(--muted)]" aria-hidden="true"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}

export default function RealtimeMonitoring({ devices = [], onNavigateToDevices }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState(devices[0]?.id ? String(devices[0].id) : '');
  const [reading, setReading] = useState(null);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [usingServerLimits, setUsingServerLimits] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(new Date());
  const [fetchError, setFetchError] = useState('');
  const activeDeviceRef = useRef(selectedDeviceId);

  activeDeviceRef.current = selectedDeviceId;
  const selectedDevice = devices.find(d => String(d.id) === String(selectedDeviceId)) || null;

  const fetchThresholds = async () => {
    try {
      const res = await axios.get('/api/thresholds');
      if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const nextLimits = { ...DEFAULT_LIMITS };
        for (const item of res.data.data) {
          const low = Number(item.low_limit);
          const high = Number(item.high_limit);
          if (item.parameter && Number.isFinite(low) && Number.isFinite(high)) {
            nextLimits[item.parameter] = { low, high };
          }
        }
        setLimits(nextLimits);
        setUsingServerLimits(true);
      }
    } catch (err) {
      // Giữ bộ ngưỡng mặc định nếu chưa tải được từ máy chủ
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  useEffect(() => {
    if (devices.length > 0) {
      const exists = devices.some(d => String(d.id) === String(selectedDeviceId));
      if (!selectedDeviceId || !exists) {
        setSelectedDeviceId(String(devices[0].id));
      }
    } else {
      setSelectedDeviceId('');
      setReading(null);
    }
  }, [devices]);

  const fetchLatestReading = async (deviceId) => {
    if (!deviceId) return;
    try {
      setLoading(true);
      setFetchError('');
      const res = await axios.get(`/api/readings/latest?deviceId=${deviceId}`);
      if (String(activeDeviceRef.current) !== String(deviceId)) return;
      if (res.data?.success) {
        setReading(res.data.data);
        setLastFetched(new Date());
      } else {
        setFetchError('Không thể tải số đo mới nhất. Vui lòng thử làm mới.');
      }
    } catch (err) {
      if (String(activeDeviceRef.current) !== String(deviceId)) return;
      console.error('Lỗi nạp số đo mới nhất:', err);
      setFetchError('Không thể tải số đo mới nhất. Vui lòng kiểm tra kết nối và thử làm mới.');
    } finally {
      if (String(activeDeviceRef.current) === String(deviceId)) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setReading(null);
    setFetchError('');
    if (selectedDeviceId) {
      fetchLatestReading(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedDeviceId) {
        fetchLatestReading(selectedDeviceId);
        fetchThresholds();
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [selectedDeviceId]);

  const getSoilEvaluation = (r) => {
    if (!r) return null;
    const ph = Number(r.ph);
    const ec = Number(r.ec);
    const n = Number(r.n);
    const moisture = hasMetric(r.moisture) ? Number(r.moisture) : null;

    let status = 'Đất Đạt Ngưỡng An Toàn';
    let desc = 'Các chỉ số trọng yếu (pH, EC, N) đang nằm trong dải ngưỡng cấu hình.';
    let level = 'optimal';

    if (ph < limits.ph.low) {
      status = 'Đất Bị Chua / Phèn';
      desc = `Độ pH đạt ${ph} (< ${limits.ph.low}). Cần bón vôi nông nghiệp để nâng pH giúp rễ hấp thu lân tốt hơn.`;
      level = 'warning';
    } else if (ph > limits.ph.high) {
      status = 'Đất Bị Kiềm Hóa';
      desc = `Độ pH đạt ${ph} (> ${limits.ph.high}). Cần bổ sung phân hữu cơ hoặc lưu huỳnh để hạ pH.`;
      level = 'warning';
    } else if (ec > limits.ec.high) {
      status = 'Đất Có Dấu Hiệu Mặn Hóa';
      desc = `Độ dẫn điện EC = ${ec} µS/cm (> ${limits.ec.high}). Nồng độ muối hòa tan cao, cần thau chua rửa mặn.`;
      level = 'danger';
    } else if (ec < limits.ec.low) {
      status = 'Đất Nghèo Muối Khoáng Hòa Tan';
      desc = `Độ dẫn điện EC = ${ec} µS/cm (< ${limits.ec.low}). Khả năng giữ và cung cấp dinh dưỡng kém.`;
      level = 'warning';
    } else if (n < limits.n.low) {
      status = 'Đất Nghèo Dinh Dưỡng Đạm';
      desc = `Nồng độ Đạm N = ${n} mg/kg (< ${limits.n.low}). Cây trồng có nguy cơ vàng lá, chậm phát triển.`;
      level = 'warning';
    } else if (moisture !== null && moisture < limits.moisture.low) {
      status = 'Đất Đang Khô Hạn';
      desc = `Độ ẩm đất đạt ${moisture}% (< ${limits.moisture.low}%). Cần tưới bổ sung để tránh cây bị héo rũ.`;
      level = 'warning';
    } else if (moisture !== null && moisture > limits.moisture.high) {
      status = 'Đất Có Nguy Cơ Úng Nước';
      desc = `Độ ẩm đất đạt ${moisture}% (> ${limits.moisture.high}%). Cần kiểm tra thoát nước tránh thối rễ.`;
      level = 'warning';
    }

    return { status, desc, level };
  };

  const evalResult = getSoilEvaluation(reading);
  const canEvaluate = reading && [reading.ph, reading.ec, reading.n].every(hasMetric);
  const nutrients = [
    { key: 'n', symbol: 'N', label: 'Đạm tổng số', min: limits.n.low, max: limits.n.high, scaleMax: Math.max(200, Math.ceil(limits.n.high * 1.25)) },
    { key: 'p', symbol: 'P', label: 'Lân dễ tiêu', min: limits.p.low, max: limits.p.high, scaleMax: Math.max(100, Math.ceil(limits.p.high * 1.25)) },
    { key: 'k', symbol: 'K', label: 'Kali trao đổi', min: limits.k.low, max: limits.k.high, scaleMax: Math.max(250, Math.ceil(limits.k.high * 1.25)) },
  ];
  const measuredMode = reading?.mode === 'auto' ? 'Tự động (NTP)' : reading?.mode === 'manual' ? 'Thủ công (Nút bấm)' : reading?.mode || 'Chưa có chế độ';
  const thresholdLabel = usingServerLimits ? 'Ngưỡng cấu hình' : 'Tham chiếu mặc định';

  const getEnvStatus = (key, rawVal) => {
    if (!hasMetric(rawVal)) return { text: 'Chưa có số đo', warn: false };
    const val = Number(rawVal);
    const { low, high } = limits[key];
    if (key === 'ec') {
      if (val < low) return { text: `Dưới ${low} µS/cm`, warn: true };
      if (val > high) return { text: `Vượt ${high} µS/cm (nguy cơ mặn)`, warn: true };
      return { text: `Trong ngưỡng ${low} – ${high} µS/cm`, warn: false };
    }
    if (key === 'moisture') {
      if (val < low) return { text: `Khô (< ${low}%)`, warn: true };
      if (val > high) return { text: `Ẩm cao (> ${high}%)`, warn: true };
      return { text: 'Độ ẩm đạt ngưỡng', warn: false };
    }
    if (key === 'temperature') {
      if (val < low) return { text: `Thấp (< ${low}°C)`, warn: true };
      if (val > high) return { text: `Cao (> ${high}°C)`, warn: true };
      return { text: 'Nhiệt độ ổn định', warn: false };
    }
    return { text: 'Số đo hiện tại', warn: false };
  };

  return (
    <div className="page min-w-0 space-y-6 text-[var(--ink)]">
      <PageHeader
        eyebrow="Quan trắc đất · Số đo mới nhất"
        title="Hiểu đất. Chăm cây."
        description="Bảy thông số từ trạm bạn chọn. Tự động tải số đo mới nhất mỗi 10 giây."
        illustration
      />

      <section className="panel flex min-w-0 flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between" aria-label="Chọn trạm và làm mới số đo">
        <Field label="Trạm đang theo dõi" htmlFor="monitoring-device" className="min-w-0 lg:w-96 lg:max-w-full">
          <select id="monitoring-device" value={selectedDeviceId} onChange={e => setSelectedDeviceId(e.target.value)} disabled={devices.length === 0} className="w-full min-w-0 max-w-full">
            {devices.length === 0 ? <option value="">Chưa có trạm đo nào</option> : devices.map(d => (
              <option key={d.id} value={d.id}>{d.device_code || `#${String(d.id).padStart(3, '0')}`} — {d.name} ({d.type === 'fixed' ? 'Cố định' : 'Cầm tay'})</option>
            ))}
          </select>
        </Field>
        {selectedDevice && <div className="flex min-w-0 flex-wrap items-center gap-3 pb-1">
          <Badge>{selectedDevice.type === 'fixed' ? <Radio size={14} aria-hidden="true" /> : <Smartphone size={14} aria-hidden="true" />}{selectedDevice.type === 'fixed' ? 'Trạm cố định' : 'Thiết bị cầm tay'}</Badge>
          <Badge tone={selectedDevice.is_active ? 'success' : 'neutral'}>{selectedDevice.is_active ? 'Đã bật nhận dữ liệu' : 'Đã tắt nhận dữ liệu'}</Badge>
        </div>}
        <Button variant="secondary" onClick={() => { fetchLatestReading(selectedDeviceId); fetchThresholds(); }} busy={loading} disabled={!selectedDeviceId}>
          {!loading && <RefreshCw size={16} aria-hidden="true" />}{loading ? 'Đang tải số đo' : 'Làm mới'}
        </Button>
      </section>

      {devices.length === 0 ? (
        <div className="panel"><EmptyState title="Chưa có trạm để theo dõi" description="Kích hoạt trạm đo trong mục Thiết bị (nhập Mã thiết bị &amp; PIN trên vỏ trạm, hoặc do quản trị viên bàn giao) để bắt đầu xem số đo." action={onNavigateToDevices && <Button onClick={onNavigateToDevices}>Đi tới Thiết bị</Button>} /></div>
      ) : (
        <>
          {fetchError && <Notice tone="error">{fetchError}{reading && <p className="mt-1">Các số đo bên dưới thuộc lần tải thành công trước đó, chưa được cập nhật.</p>}</Notice>}
          {!reading ? (
            !fetchError && (
              <div className="panel" aria-busy={loading}>
                <EmptyState
                  loading={loading}
                  title={loading
                    ? 'Đang tải số đo của trạm'
                    : selectedDevice?.provisioning_status === 'pending_approval'
                      ? 'Trạm đang chờ Quản trị viên duyệt'
                      : selectedDevice?.provisioning_status === 'awaiting_activation'
                        ? 'Trạm đã được duyệt — chờ nhập mã kích hoạt'
                        : selectedDevice?.provisioning_status === 'pairing_open'
                          ? 'Cổng ghép nối phần cứng đang mở'
                          : 'Trạm chưa có bản ghi số đo'}
                  description={loading
                    ? 'Đang lấy bản ghi mới nhất, vui lòng chờ.'
                    : selectedDevice?.provisioning_status === 'pending_approval'
                      ? 'Quản trị viên cần duyệt yêu cầu trước khi bạn nhận mã kích hoạt cho cảm biến.'
                      : selectedDevice?.provisioning_status === 'awaiting_activation'
                        ? 'Vào mục Thiết bị để nhập mã kích hoạt 6 số mà Quản trị viên vừa gửi cho bạn.'
                        : selectedDevice?.provisioning_status === 'pairing_open'
                          ? `Hãy bật nguồn cảm biến MAC ${selectedDevice.hardware_mac || ''} (hoặc chạy Simulator) để thiết bị nhận khóa và gửi số đo đầu tiên.`
                          : 'Hãy bật nguồn trạm đo đã kết nối mạng (hoặc chạy trình giả lập khi kiểm thử). Số đo đầu tiên sẽ tự động hiển thị tại đây ngay khi trạm gửi về.'}
                  action={!loading && selectedDevice?.provisioning_status && selectedDevice.provisioning_status !== 'active' && onNavigateToDevices && (
                    <Button onClick={onNavigateToDevices}>Đi tới Thiết bị</Button>
                  )}
                />
              </div>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-xs text-[var(--muted)]">
                <span className="inline-flex items-center gap-2"><Clock size={14} aria-hidden="true" />Đo lúc: <time dateTime={reading.measured_at || undefined}>{formatTime(reading.measured_at)}</time></span>
                <span>{measuredMode} · Bản ghi #{reading.id ?? '—'}</span>
              </div>

              <section aria-label="Chỉ số môi trường đất" className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <article className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--soft)] p-6">
                  <h2 className="font-[Cambria,Georgia,serif] text-2xl">pH đất</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <p className="break-all font-[Cambria,Georgia,serif] text-7xl leading-tight tabular-nums">{metricValue(reading.ph)}</p>
                    <Badge tone={!hasMetric(reading.ph) ? 'neutral' : reading.ph >= limits.ph.low && reading.ph <= limits.ph.high ? 'success' : 'warning'}>
                      {!hasMetric(reading.ph) ? 'Chưa có số đo' : reading.ph < limits.ph.low ? 'Đất chua / phèn' : reading.ph > limits.ph.high ? 'Đất kiềm' : 'Trung tính'}
                    </Badge>
                  </div>
                  <MetricRail label="Độ chua pH" value={reading.ph} referenceMin={limits.ph.low} referenceMax={limits.ph.high} scaleMax={14} warning={hasMetric(reading.ph) && (reading.ph < limits.ph.low || reading.ph > limits.ph.high)} />
                  <p className="mt-3 text-xs text-[var(--muted)]">{thresholdLabel}: {limits.ph.low} – {limits.ph.high}</p>
                </article>

                <div className="panel grid min-w-0 grid-cols-1 divide-y divide-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {[
                    { key: 'moisture', label: 'Độ ẩm đất', unit: '%', reference: `${limits.moisture.low} – ${limits.moisture.high}`, icon: Droplets },
                    { key: 'temperature', label: 'Nhiệt độ tầng rễ', unit: '°C', reference: `${limits.temperature.low} – ${limits.temperature.high}`, icon: Thermometer },
                    { key: 'ec', label: 'Độ dẫn điện EC', unit: 'µS/cm', reference: `${limits.ec.low} – ${limits.ec.high}`, icon: Activity },
                  ].map(({ key, label, unit, reference, icon: Icon }) => {
                    const statusInfo = getEnvStatus(key, reading[key]);
                    return (
                      <article key={key} className="flex min-w-0 flex-col px-5 py-6">
                        <h2 className="font-[Cambria,Georgia,serif] text-xl">{label}</h2>
                        <p className="my-3 flex flex-wrap items-baseline gap-x-2 font-[Cambria,Georgia,serif]"><span className="break-all text-4xl tabular-nums">{metricValue(reading[key])}</span><span className="text-lg">{unit}</span></p>
                        <div className="mb-4 flex items-start gap-2 text-xs"><Icon size={16} className={`shrink-0 ${statusInfo.warn ? 'text-[var(--clay)]' : 'text-[var(--green)]'}`} aria-hidden="true" />
                          <span className={statusInfo.warn ? 'text-[var(--clay)]' : hasMetric(reading[key]) ? 'text-[var(--green)]' : 'text-[var(--muted)]'}>{statusInfo.text}</span>
                        </div>
                        <p className="mt-auto text-xs leading-relaxed text-[var(--muted)]">{thresholdLabel}<br /><span className="text-[var(--ink)]">{reference} {unit}</span></p>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section aria-labelledby="soil-nutrients">
                <div className="section-head flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-3">
                  <h2 id="soil-nutrients" className="font-[Cambria,Georgia,serif] text-2xl">Dinh dưỡng trong đất</h2>
                  <p className="text-xs text-[var(--muted)]">Chỉ số NPK mang tính tham khảo</p>
                </div>
                <div className="grid min-w-0 grid-cols-1 divide-y divide-[var(--line)] md:grid-cols-3 md:divide-x md:divide-y-0">
                  {nutrients.map(({ key, symbol, label, min, max, scaleMax }) => {
                    const value = reading[key];
                    const available = hasMetric(value);
                    const withinRange = available && value >= min && value <= max;
                    return <article key={key} className="min-w-0 px-5 py-5">
                      <h3 className="font-[Cambria,Georgia,serif] text-lg">{symbol} / {label}</h3>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="flex flex-wrap items-baseline gap-2 font-[Cambria,Georgia,serif]"><span className="break-all text-4xl tabular-nums">{metricValue(value)}</span><span>mg/kg</span></p>
                        <Badge tone={!available ? 'neutral' : withinRange ? 'success' : 'warning'}>{!available ? 'Chưa có số đo' : withinRange ? 'Đầy đủ' : value < min ? 'Thiếu hụt' : 'Dư thừa'}</Badge>
                      </div>
                      <MetricRail label={`${label} (${symbol}), mg/kg`} value={value} referenceMin={min} referenceMax={max} scaleMax={scaleMax} warning={available && !withinRange} />
                      <p className="mt-2 text-xs text-[var(--muted)]">{thresholdLabel}: {min} – {max} mg/kg</p>
                    </article>;
                  })}
                </div>
              </section>

              <div className="split-layout min-w-0">
                <section className="panel min-w-0 space-y-4 p-5 sm:p-6" aria-labelledby="soil-evaluation">
                  <div><p className="eyebrow">Đọc số đo cùng bạn</p><h2 id="soil-evaluation" className="mt-1 font-[Cambria,Georgia,serif] text-2xl">Đánh giá đất · Kết quả tham khảo</h2></div>
                  {canEvaluate && evalResult ? <Notice tone={evalResult.level === 'optimal' ? 'success' : evalResult.level === 'warning' ? 'warning' : 'error'}>
                    <h3 className="font-semibold">{evalResult.status}</h3>
                    <p className="mt-1 leading-relaxed">{evalResult.desc}</p>
                  </Notice> : <Notice>Chưa đủ số đo pH, EC và N để hiển thị đánh giá tham khảo.</Notice>}
                  <p className="text-sm leading-relaxed text-[var(--muted)]">Kết quả đối chiếu theo dải ngưỡng an toàn đang áp dụng, không phải kết luận nông học tuyệt đối. Cần xét thêm điều kiện đất, cây trồng và tư vấn chuyên môn trước khi bón phân.</p>
                  <div className="border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
                    <p>Vùng tô trên thang đo là dải {thresholdLabel.toLowerCase()}; chấm tròn là số đo thực tế. Thang tự mở rộng khi số đo vượt giới hạn hiển thị.</p>
                    <p className="mt-2">{usingServerLimits ? 'Hệ thống đang đồng bộ dải ngưỡng từ cấu hình trên máy chủ (pH, EC, NPK, Nhiệt độ, Độ ẩm).' : 'Đang sử dụng bộ ngưỡng mặc định TCVN khi chưa nhận được cấu hình từ máy chủ.'}</p>
                  </div>
                </section>

                <aside className="panel min-w-0 p-5 sm:p-6" aria-labelledby="reading-context">
                  <p className="eyebrow">Thông tin trạm & gói tin</p>
                  <h2 id="reading-context" className="mt-1 break-words font-[Cambria,Georgia,serif] text-2xl">{selectedDevice?.name || 'Trạm quan trắc'}</h2>
                  <dl className="info-list mt-4 space-y-3 text-sm">
                    {[
                      ['Mã thiết bị', selectedDevice?.device_code || (selectedDevice?.id != null ? `#${selectedDevice.id}` : '—')],
                      ['Bản ghi mới nhất', reading.id != null ? `#${reading.id}` : '—'],
                      ['Chế độ đo', measuredMode],
                      ['Thời điểm đo', formatTime(reading.measured_at)],
                      ['Web cập nhật', formatTime(lastFetched)],
                      ['Chu kỳ tải', 'Mỗi 10 giây'],
                    ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="min-w-0 break-words">{value}</dd></div>)}
                  </dl>
                  <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">Bật / tắt nhận dữ liệu không phản ánh trạng thái kết nối của trạm. Trang này chỉ có bản ghi mới nhất, chưa có dữ liệu lịch sử để thể hiện xu hướng.</p>
                  {onNavigateToDevices && <Button variant="ghost" onClick={onNavigateToDevices} className="mt-4">Quản lý trạm đo</Button>}
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
