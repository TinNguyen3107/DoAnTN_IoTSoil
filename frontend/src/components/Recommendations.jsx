import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Calculator,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  ChevronDown,
  FlaskConical,
  Sprout,
} from 'lucide-react';
import { PageHeader, Button, Badge, Notice, EmptyState, Field } from './UI.jsx';

export default function Recommendations({ devices = [] }) {
  const [activeSubTab, setActiveSubTab] = useState('fertilizer'); // 'fertilizer' | 'crops'

  // Trạng thái trạm đo được chọn
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [crops, setCrops] = useState([]);

  // Form Tính Phân Bón (UC-15)
  const [selectedCropId, setSelectedCropId] = useState('');
  const [areaValue, setAreaValue] = useState('1');
  const [areaUnit, setAreaUnit] = useState('ha');
  const [fertilizerAdvice, setFertilizerAdvice] = useState(null);
  const [loadingFertilizer, setLoadingFertilizer] = useState(false);
  const [fertilizerError, setFertilizerError] = useState('');

  // Gợi Ý Cây Trồng (UC-16)
  const [suitableCropsResult, setSuitableCropsResult] = useState(null);
  const [loadingCrops, setLoadingCrops] = useState(false);
  const [cropsError, setCropsError] = useState('');

  // Tải danh mục cây trồng
  useEffect(() => {
    const fetchCrops = async () => {
      try {
        const res = await axios.get('/api/recommendations/crops');
        if (res.data?.success && res.data.data.length > 0) {
          setCrops(res.data.data);
          setSelectedCropId(String(res.data.data[0].id));
        }
      } catch (err) {
        console.error('Lỗi tải danh mục cây trồng:', err);
      }
    };
    fetchCrops();
  }, []);

  // Khởi tạo / đồng bộ trạm mặc định khi danh sách thiết bị thay đổi
  useEffect(() => {
    if (devices.length > 0) {
      const exists = devices.some(d => String(d.id) === String(selectedDeviceId));
      if (!selectedDeviceId || !exists) {
        setSelectedDeviceId(String(devices[0].id));
      }
    } else {
      setSelectedDeviceId('');
      setFertilizerAdvice(null);
      setSuitableCropsResult(null);
    }
  }, [devices]);

  // UC-15: Tính toán lượng phân bón NPK
  const handleCalculateFertilizer = async () => {
    if (!selectedDeviceId || !selectedCropId) return;

    const numArea = parseFloat(areaValue);
    if (isNaN(numArea) || numArea <= 0) {
      setFertilizerError('Quy mô diện tích canh tác phải là số dương lớn hơn 0.');
      setFertilizerAdvice(null);
      return;
    }

    try {
      setLoadingFertilizer(true);
      setFertilizerError('');
      const res = await axios.get(
        `/api/recommendations/fertilizer?deviceId=${selectedDeviceId}&cropId=${selectedCropId}&area=${numArea}&unit=${areaUnit}`
      );
      if (res.data?.success) {
        setFertilizerAdvice(res.data.data);
      }
    } catch (err) {
      setFertilizerError(err.response?.data?.message || 'Không thể tính toán lượng phân bón.');
      setFertilizerAdvice(null);
    } finally {
      setLoadingFertilizer(false);
    }
  };

  // UC-16: Đánh giá thích nghi và gợi ý Top 3 giống cây
  const handleFindSuitableCrops = async () => {
    if (!selectedDeviceId) return;

    try {
      setLoadingCrops(true);
      setCropsError('');
      const res = await axios.get(`/api/recommendations/suitable-crops?deviceId=${selectedDeviceId}`);
      if (res.data?.success) {
        setSuitableCropsResult(res.data.data);
      }
    } catch (err) {
      setCropsError(err.response?.data?.message || 'Không thể đánh giá độ thích nghi cây trồng.');
      setSuitableCropsResult(null);
    } finally {
      setLoadingCrops(false);
    }
  };

  // Tự động tính toán khi chọn trạm hoặc đổi cây
  useEffect(() => {
    if (selectedDeviceId && selectedCropId) {
      handleCalculateFertilizer();
    }
  }, [selectedDeviceId, selectedCropId, areaUnit]);

  useEffect(() => {
    if (selectedDeviceId && activeSubTab === 'crops') {
      handleFindSuitableCrops();
    }
  }, [selectedDeviceId, activeSubTab]);

  const chipClass = (active) =>
    `px-4 py-2 rounded-full text-xs border transition-colors inline-flex items-center gap-2 ${
      active
        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
        : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--soft)]'
    }`;

  const currentDevice = devices.find(d => String(d.id) === String(selectedDeviceId));
  const targetCrop = crops.find(c => String(c.id) === String(selectedCropId));
  const areaLabel = { ha: 'ha', m2: 'm²', sao_bac_bo: 'sào Bắc Bộ', sao_trung_bo: 'sào Trung Bộ' }[areaUnit] || areaUnit;
  const fertilizerRows = fertilizerAdvice
    ? [
        { key: 'n', label: 'Urê', note: 'Đạm 46% N', amount: fertilizerAdvice.fertilizers?.urea, current: fertilizerAdvice.currentValues?.n, target: fertilizerAdvice.targetValues?.n },
        { key: 'p', label: 'Super lân', note: 'Lân 16% P₂O₅', amount: fertilizerAdvice.fertilizers?.superPhosphate, current: fertilizerAdvice.currentValues?.p, target: fertilizerAdvice.targetValues?.p2o5 },
        { key: 'k', label: 'Kali clorua', note: 'Kali 60% K₂O', amount: fertilizerAdvice.fertilizers?.potassiumChloride, current: fertilizerAdvice.currentValues?.k, target: fertilizerAdvice.targetValues?.k2o },
      ]
    : [];

  if (devices.length === 0) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Khuyến nông"
          title="Chưa có trạm để tư vấn."
          description="Định mức phân bón và xếp hạng giống cây đều tính từ số đo đất mới nhất của một trạm, nên cần có trạm trước."
          illustration
        />
        <EmptyState
          title="Danh sách trạm đang trống"
          description="Kích hoạt trạm quan trắc ở mục Thiết bị để động cơ khuyến nông có số liệu đối chiếu."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Khuyến nông"
        title={activeSubTab === 'fertilizer' ? 'Cần bón bao nhiêu là đủ.' : 'Đất này hợp với cây gì.'}
        description={activeSubTab === 'fertilizer'
          ? 'Hệ thống so sánh nhu cầu dinh dưỡng của giống cây với số đo đất thực tế, rồi quy đổi phần thiếu hụt ra lượng phân thương phẩm và chia theo từng đợt bón.'
          : 'Bộ chấm điểm đối chiếu pH, độ mặn EC và dinh dưỡng N-K của trạm với từng giống cây, rồi xếp hạng ba lựa chọn phù hợp nhất.'}
        illustration
      />

      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={chipClass(activeSubTab === 'fertilizer')} aria-pressed={activeSubTab === 'fertilizer'} onClick={() => setActiveSubTab('fertilizer')}>
            <Calculator size={14} /> Định lượng phân bón
          </button>
          <button type="button" className={chipClass(activeSubTab === 'crops')} aria-pressed={activeSubTab === 'crops'} onClick={() => setActiveSubTab('crops')}>
            <Sprout size={14} /> Gợi ý cây trồng
          </button>
        </div>
        <Field label="Trạm quan trắc" htmlFor="rec-device" className="min-w-[240px] max-w-xs">
          <div className="relative">
            <select id="rec-device" value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)} className="w-full appearance-none pr-9">
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} · {d.type === 'fixed' ? 'Cố định' : 'Cầm tay'}</option>
              ))}
            </select>
            <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
          </div>
        </Field>
      </div>

      <p className="muted text-xs">
        {currentDevice
          ? `Kết quả dưới đây lấy từ bản ghi mới nhất của trạm ${currentDevice.name}. Đổi trạm hoặc đổi cây sẽ tính lại ngay.`
          : 'Chọn một trạm để bắt đầu.'}
      </p>

      {activeSubTab === 'fertilizer' && (
        <>
          <section className="panel">
            <div className="section-head">
              <div>
                <h2 className="text-lg">Thông số canh tác</h2>
                <p>Giống cây và diện tích quyết định toàn bộ định mức bón.</p>
              </div>
            </div>

            <div className="form-grid lg:grid-cols-3">
              <Field label="Giống cây mục tiêu" htmlFor="rec-crop" hint={targetCrop ? `Đang đối chiếu nhu cầu của ${targetCrop.name}.` : 'Danh mục giống cây tải từ máy chủ.'}>
                <div className="relative">
                  <select id="rec-crop" value={selectedCropId} onChange={(e) => setSelectedCropId(e.target.value)} className="w-full appearance-none pr-9">
                    {crops.length === 0 && <option value="">Đang tải danh mục cây trồng</option>}
                    {crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
                </div>
              </Field>

              <Field label="Diện tích canh tác" htmlFor="rec-area" hint="Chỉ tính phần diện tích bạn thực sự bón.">
                <input
                  id="rec-area"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={areaValue}
                  onChange={(e) => setAreaValue(e.target.value)}
                  className="tabular-nums"
                  placeholder="VD: 1.0"
                />
              </Field>

              <Field label="Đơn vị diện tích" htmlFor="rec-unit" hint="Đổi đơn vị sẽ tính lại định mức.">
                <div className="relative">
                  <select id="rec-unit" value={areaUnit} onChange={(e) => setAreaUnit(e.target.value)} className="w-full appearance-none pr-9">
                    <option value="ha">Hecta (10.000 m²)</option>
                    <option value="sao_bac_bo">Sào Bắc Bộ (360 m²)</option>
                    <option value="sao_trung_bo">Sào Trung Bộ (500 m²)</option>
                    <option value="m2">Mét vuông (m²)</option>
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
                </div>
              </Field>
            </div>

            <div className="flex justify-end mt-6">
              <Button onClick={handleCalculateFertilizer} busy={loadingFertilizer} disabled={!selectedDeviceId || !selectedCropId}>
                {!loadingFertilizer && <Calculator size={16} />}
                {loadingFertilizer ? 'Đang tính toán' : 'Tính lượng phân bón'}
              </Button>
            </div>
          </section>

          {fertilizerError && <Notice tone="error">{fertilizerError}</Notice>}

          {loadingFertilizer && !fertilizerAdvice && (
            <EmptyState loading title="Đang đối chiếu số đo đất" description="Máy chủ đọc bản ghi mới nhất và tính phần thiếu hụt cho từng nguyên tố." />
          )}

          {fertilizerAdvice && (
            <>
              <Notice tone={fertilizerAdvice.isTotallySurplus ? 'warning' : 'success'}>
                <div className="space-y-1">
                  <div className="font-semibold text-sm">
                    {fertilizerAdvice.isTotallySurplus ? 'Đất đang dư dinh dưỡng' : 'Kế hoạch bón cân đối'}
                  </div>
                  <div>{fertilizerAdvice.adviceMessage}</div>
                </div>
              </Notice>

              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2 className="text-lg">Lượng phân thương phẩm</h2>
                    <p>Quy đổi từ phần thiếu hụt trên {areaValue || '0'} {areaLabel}.</p>
                  </div>
                  <Badge tone={fertilizerAdvice.isTotallySurplus ? 'warning' : 'success'}>
                    {fertilizerAdvice.isTotallySurplus ? 'Không cần bổ sung' : 'Cần bổ sung'}
                  </Badge>
                </div>
                <div className="table-wrap">
                  <table className="data-table min-w-[620px]">
                    <thead>
                      <tr>
                        <th>Loại phân</th>
                        <th>Hiện trạng đất (mg/kg)</th>
                        <th>Nhu cầu cây (mg/kg)</th>
                        <th className="text-right">Lượng dùng (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fertilizerRows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <div className="font-semibold">{row.label}</div>
                            <div className="muted text-xs">{row.note}</div>
                          </td>
                          <td className="tabular-nums">{row.current ?? '—'}</td>
                          <td className="tabular-nums">{row.target ?? '—'}</td>
                          <td className="text-right tabular-nums font-semibold">{row.amount ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {!fertilizerAdvice.isTotallySurplus && (fertilizerAdvice.schedule?.length ?? 0) > 0 && (
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <h2 className="text-lg">Chia đợt bón</h2>
                      <p>Lượng phân phía trên được chia theo từng giai đoạn phát triển của cây.</p>
                    </div>
                    <span className="muted text-xs flex items-center gap-2"><FlaskConical size={14} /> {fertilizerAdvice.schedule.length} đợt</span>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table min-w-[820px]">
                      <thead>
                        <tr>
                          <th>Giai đoạn</th>
                          <th>Thời điểm</th>
                          <th className="text-right">Urê (kg)</th>
                          <th className="text-right">Super lân (kg)</th>
                          <th className="text-right">Kali clorua (kg)</th>
                          <th>Mục tiêu nông học</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fertilizerAdvice.schedule.map((s, idx) => (
                          <tr key={idx}>
                            <td className="font-semibold">{s.stage}</td>
                            <td className="muted">{s.timing}</td>
                            <td className="text-right tabular-nums">{s.urea}</td>
                            <td className="text-right tabular-nums">{s.superPhosphate}</td>
                            <td className="text-right tabular-nums">{s.potassiumChloride}</td>
                            <td className="muted text-xs max-w-[280px]">{s.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}

      {activeSubTab === 'crops' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2 className="text-lg">Xếp hạng độ thích nghi</h2>
              <p>Điểm càng cao nghĩa là số đo đất của trạm càng gần dải sinh trưởng tối ưu của giống cây đó.</p>
            </div>
            <Button variant="secondary" onClick={handleFindSuitableCrops} busy={loadingCrops}>
              {!loadingCrops && <RefreshCw size={16} />}
              {loadingCrops ? 'Đang chấm điểm' : 'Đánh giá lại'}
            </Button>
          </div>

          {cropsError && <Notice tone="error">{cropsError}</Notice>}

          {loadingCrops && !suitableCropsResult ? (
            <EmptyState loading title="Đang chấm điểm tương thích" description="So sánh pH, EC và dinh dưỡng của trạm với từng giống cây trong danh mục." />
          ) : suitableCropsResult?.needsSoilAmendment ? (
            <div className="space-y-4">
              <Notice tone="warning">
                <div className="space-y-1">
                  <div className="font-semibold text-sm">Nên cải tạo đất trước khi gieo trồng</div>
                  <div>{suitableCropsResult.amendmentAdvice}</div>
                </div>
              </Notice>
              {suitableCropsResult.currentSoil && (
                <div className="notice notice-info">
                  <AlertCircle size={18} />
                  <div className="tabular-nums">
                    Số đo hiện tại của trạm: pH {suitableCropsResult.currentSoil.ph} · EC {suitableCropsResult.currentSoil.ec} µS/cm · N {suitableCropsResult.currentSoil.n} mg/kg · P {suitableCropsResult.currentSoil.p} mg/kg · K {suitableCropsResult.currentSoil.k} mg/kg
                  </div>
                </div>
              )}
            </div>
          ) : (suitableCropsResult?.topCrops?.length ?? 0) > 0 ? (
            <div className="space-y-6">
              {suitableCropsResult.currentSoil && (
                <p className="muted text-xs tabular-nums">
                  Số đo nền để chấm điểm: pH {suitableCropsResult.currentSoil.ph} · EC {suitableCropsResult.currentSoil.ec} µS/cm · N {suitableCropsResult.currentSoil.n} · P {suitableCropsResult.currentSoil.p} · K {suitableCropsResult.currentSoil.k} mg/kg
                </p>
              )}

              <ol>
                {suitableCropsResult.topCrops.map((crop, idx) => (
                  <li key={crop.id} className="border-t border-[var(--line)] py-7 first:border-t-0 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-5 min-w-0">
                        <span className="heading-number">{idx + 1}</span>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold">{crop.name}</h3>
                          <div className="mt-3 w-44 max-w-full h-1.5 rounded-full bg-[var(--soft)]">
                            <div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${Math.max(0, Math.min(100, Number(crop.score) || 0))}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl tabular-nums font-semibold text-[var(--green)] leading-none">
                          {crop.score}
                          <span className="text-xs font-normal muted ml-1">/100</span>
                        </div>
                        <p className="muted text-[11px] mt-1">Điểm thích nghi</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 mt-5">
                      <div>
                        <p className="text-xs font-semibold flex items-center gap-2 text-[var(--green)]"><CheckCircle2 size={14} /> Thuận lợi thổ nhưỡng</p>
                        <ul className="mt-2 pl-5 list-disc space-y-1 text-xs muted">
                          {(crop.pros ?? []).map((p, pIdx) => <li key={pIdx}>{p}</li>)}
                        </ul>
                      </div>
                      {(crop.cons ?? []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold flex items-center gap-2 text-[#8b5830]"><AlertCircle size={14} /> Lưu ý canh tác</p>
                          <ul className="mt-2 pl-5 list-disc space-y-1 text-xs muted">
                            {crop.cons.map((c, cIdx) => <li key={cIdx}>{c}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedCropId(String(crop.id));
                          setActiveSubTab('fertilizer');
                        }}
                      >
                        Tính phân bón cho {crop.name} <ArrowRight size={16} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : !cropsError ? (
            <EmptyState
              title="Chưa có kết quả đánh giá"
              description="Bấm Đánh giá lại để máy chủ chấm điểm theo số đo mới nhất của trạm."
              action={<Button variant="secondary" onClick={handleFindSuitableCrops}>Đánh giá lại</Button>}
            />
          ) : null}
        </section>
      )}
    </div>
  );
}
