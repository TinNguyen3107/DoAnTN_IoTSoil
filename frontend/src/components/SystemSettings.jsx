import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save } from 'lucide-react';
import { PageHeader, Button, Notice, Field } from './UI.jsx';

export default function SystemSettings() {
  const [configs, setConfigs] = useState({
    UREA_N_PERCENT: '46',
    SUPER_PHOSPHATE_P_PERCENT: '16',
    POTASSIUM_CHLORIDE_K_PERCENT: '60',
    SOIL_DEPTH_M: '0.2',
    SOIL_BULK_DENSITY: '1.3',
    AREA_M2_PER_HA: '10000'
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  // Nạp tham số cấu hình từ máy chủ
  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/api/system-configs');
      if (res.data?.success && res.data.data?.map) {
        const m = res.data.data.map;
        setConfigs({
          UREA_N_PERCENT: String(m.UREA_N_PERCENT ?? 46),
          SUPER_PHOSPHATE_P_PERCENT: String(m.SUPER_PHOSPHATE_P_PERCENT ?? 16),
          POTASSIUM_CHLORIDE_K_PERCENT: String(m.POTASSIUM_CHLORIDE_K_PERCENT ?? 60),
          SOIL_DEPTH_M: String(m.SOIL_DEPTH_M ?? 0.2),
          SOIL_BULK_DENSITY: String(m.SOIL_BULK_DENSITY ?? 1.3),
          AREA_M2_PER_HA: String(m.AREA_M2_PER_HA ?? 10000)
        });
      }
    } catch (err) {
      console.error('Lỗi tải cấu hình hệ thống:', err);
      setStatusMessage({ type: 'error', text: 'Không thể tải cấu hình tham số từ máy chủ.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleChange = (key, value) => {
    setConfigs(prev => ({ ...prev, [key]: value }));
    if (statusMessage.text) setStatusMessage({ type: '', text: '' });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setStatusMessage({ type: '', text: '' });

      const res = await axios.put('/api/system-configs', configs);
      if (res.data?.success) {
        setStatusMessage({ 
          type: 'success', 
          text: res.data.message || 'Đã lưu tham số nông học vào cơ sở dữ liệu thành công!' 
        });
      }
    } catch (err) {
      setStatusMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Lỗi kiểm tra tham số đầu vào.' 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="page">
      <PageHeader
        eyebrow="Cấu hình / Tham số hệ thống"
        title="Hằng số nông học của hệ thống."
        description="Các giá trị dùng để quy đổi liều lượng phân bón thương mại và khối lượng tầng đất khảo sát."
        actions={
          <Button type="submit" busy={saving} disabled={loading}>
            {!saving && <Save size={16} aria-hidden="true" />}
            {saving ? 'Đang lưu…' : 'Lưu tham số hệ thống'}
          </Button>
        }
      />

      {/* Thông báo trạng thái lưu */}
      {statusMessage.text && (
        <Notice tone={statusMessage.type === 'success' ? 'success' : 'error'}>{statusMessage.text}</Notice>
      )}

      <section className="panel" aria-labelledby="fertilizer-constants-title">
        <div className="section-head">
          <div>
            <h2 id="fertilizer-constants-title">Hệ số nồng độ phân bón thương mại</h2>
            <p>Hàm lượng dinh dưỡng quy đổi chuẩn, phục vụ công thức khuyến nghị phân bón.</p>
          </div>
        </div>

        <div className="form-grid">
          <Field label="Tỷ lệ đạm nguyên chất trong phân Urê (%)" htmlFor="urea-n-percent">
            <input
              id="urea-n-percent"
              className="mono-tabular"
              type="number"
              step="0.1"
              min="1"
              max="100"
              value={configs.UREA_N_PERCENT}
              onChange={(e) => handleChange('UREA_N_PERCENT', e.target.value)}
              required
            />
          </Field>

          <Field label="Tỷ lệ P₂O₅ trong Supe Lân (%)" htmlFor="super-phosphate-p-percent">
            <input
              id="super-phosphate-p-percent"
              className="mono-tabular"
              type="number"
              step="0.1"
              min="1"
              max="100"
              value={configs.SUPER_PHOSPHATE_P_PERCENT}
              onChange={(e) => handleChange('SUPER_PHOSPHATE_P_PERCENT', e.target.value)}
              required
            />
          </Field>

          <Field label="Tỷ lệ K₂O trong phân Kali Clorua (%)" htmlFor="potassium-chloride-k-percent">
            <input
              id="potassium-chloride-k-percent"
              className="mono-tabular"
              type="number"
              step="0.1"
              min="1"
              max="100"
              value={configs.POTASSIUM_CHLORIDE_K_PERCENT}
              onChange={(e) => handleChange('POTASSIUM_CHLORIDE_K_PERCENT', e.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      <section className="panel" aria-labelledby="soil-constants-title">
        <div className="section-head">
          <div>
            <h2 id="soil-constants-title">Tham số tầng đất</h2>
            <p>Dùng để quy đổi nồng độ đo được sang khối lượng dinh dưỡng trong lớp đất mặt.</p>
          </div>
        </div>

        <div className="form-grid">
          <Field label="Độ sâu tầng đất (m)" htmlFor="soil-depth-m" hint="Phạm vi cho phép: 0.05 – 1.00 m.">
            <input
              id="soil-depth-m"
              className="mono-tabular"
              type="number"
              step="0.05"
              min="0.05"
              max="1.0"
              value={configs.SOIL_DEPTH_M}
              onChange={(e) => handleChange('SOIL_DEPTH_M', e.target.value)}
              required
            />
          </Field>

          <Field label="Dung trọng đất (tấn/m³)" htmlFor="soil-bulk-density" hint="Phạm vi cho phép: 0.50 – 2.50 tấn/m³.">
            <input
              id="soil-bulk-density"
              className="mono-tabular"
              type="number"
              step="0.05"
              min="0.5"
              max="2.5"
              value={configs.SOIL_BULK_DENSITY}
              onChange={(e) => handleChange('SOIL_BULK_DENSITY', e.target.value)}
              required
            />
          </Field>
        </div>
      </section>

      <section className="panel" aria-labelledby="infrastructure-title">
        <div className="section-head">
          <div>
            <h2 id="infrastructure-title">Hạ tầng &amp; bảo mật</h2>
            <p>Thông tin triển khai hiện tại của máy chủ, chỉ mang tính tham khảo.</p>
          </div>
        </div>

        <dl className="info-list text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="muted">MySQL server database</dt>
            <dd className="mono-tabular">127.0.0.1:3306 / soil_iot_db</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="muted">Cơ chế bảo mật IoT &amp; Auth</dt>
            <dd className="mono-tabular">SHA-256 API Key • BCrypt + JWT 8h</dd>
          </div>
        </dl>
      </section>
    </form>
  );
}
