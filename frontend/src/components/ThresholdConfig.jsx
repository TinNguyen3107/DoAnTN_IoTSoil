import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RotateCcw, Save } from 'lucide-react';
import { PageHeader, Button, Notice, EmptyState } from './UI.jsx';

const SENSOR_BOUNDS = {
  ph: { min: 0, max: 14, unit: 'Scale' },
  ec: { min: 0, max: 5000, unit: 'µS/cm' },
  n: { min: 0, max: 1000, unit: 'mg/kg' },
  p: { min: 0, max: 1000, unit: 'mg/kg' },
  k: { min: 0, max: 1000, unit: 'mg/kg' },
  temperature: { min: -20, max: 80, unit: '°C' },
  moisture: { min: 0, max: 100, unit: '%' }
};

export default function ThresholdConfig() {
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  // Step 2 & 3: Tải danh sách ngưỡng hiện tại từ máy chủ
  const fetchThresholds = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const res = await axios.get('/api/thresholds');
      if (res.data?.success) {
        setThresholds(res.data.data);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Không thể tải cấu hình ngưỡng từ máy chủ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  // Step 4a (Nhánh opt): Khôi phục ngưỡng mặc định chuẩn nông nghiệp Việt Nam
  const handleRestoreDefaults = async () => {
    try {
      const res = await axios.get('/api/thresholds/defaults');
      if (res.data?.success) {
        setThresholds(res.data.data);
        setValidationErrors({});
        setSuccessMessage('Đã tự động điền các giá trị dải ngưỡng chuẩn nông nghiệp Việt Nam. Hãy nhấn "Lưu cấu hình" để áp dụng vào CSDL.');
        setTimeout(() => setSuccessMessage(''), 5000);
      }
    } catch (err) {
      setErrorMessage('Không thể lấy cấu hình chuẩn mặc định.');
    }
  };

  // Step 5 & 6 (Nhánh opt [6a]): Xử lý chỉnh sửa và kiểm tra tính hợp lệ dữ liệu nhập
  const handleValueChange = (parameter, field, value) => {
    const updated = thresholds.map((item) => {
      if (item.parameter === parameter) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setThresholds(updated);

    // Kiểm tra ràng buộc logic Step 6: Min < Max
    const targetItem = updated.find(item => item.parameter === parameter);
    const low = parseFloat(targetItem.low_limit);
    const high = parseFloat(targetItem.high_limit);

    const bounds = SENSOR_BOUNDS[parameter];
    const errors = { ...validationErrors };
    if (isNaN(low) || isNaN(high)) {
      errors[parameter] = 'Vui lòng nhập giá trị số hợp lệ';
    } else if (low >= high) {
      // Step 6a: Báo lỗi đỏ nếu Mức tối thiểu >= Mức tối đa
      errors[parameter] = `Lỗi logic: Ngưỡng Min (${low}) phải nhỏ hơn Max (${high})`;
    } else if (bounds && (low < bounds.min || high > bounds.max)) {
      errors[parameter] = `Ngoài thang đo cảm biến (${bounds.min} – ${bounds.max} ${bounds.unit})`;
    } else {
      delete errors[parameter];
    }

    setValidationErrors(errors);
  };

  // Step 7: Gửi dữ liệu cấu hình mới lên máy chủ
  const handleSave = async () => {
    if (Object.keys(validationErrors).length > 0) {
      setErrorMessage('Vui lòng điều chỉnh lại các trường nhập liệu đang báo lỗi đỏ trước khi lưu.');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const res = await axios.put('/api/thresholds', {
        thresholds: thresholds.map(t => ({
          parameter: t.parameter,
          low_limit: parseFloat(t.low_limit),
          high_limit: parseFloat(t.high_limit)
        }))
      });

      // Step 8 & 9: Phản hồi thành công có hiệu lực tức thời
      if (res.data?.success) {
        setThresholds(res.data.data);
        setSuccessMessage('Dải ngưỡng cảnh báo mới đã được cập nhật thành công vào CSDL và áp dụng ngay cho các chu trình đo tiếp theo.');
        setTimeout(() => setSuccessMessage(''), 6000);
      }
    } catch (err) {
      setErrorMessage(err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật cấu hình ngưỡng.');
    } finally {
      setSaving(false);
    }
  };

  const hasErrors = Object.keys(validationErrors).length > 0;

  const limitInputClass = (invalid) => `mono-tabular w-full !min-h-[40px] !px-3 !py-2 text-sm font-semibold ${
    invalid ? '!border-[#a14331] !bg-[#fcf0eb] !text-[#994331]' : '!bg-[#fffefa]'
  }`;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cấu hình / Ngưỡng cảnh báo"
        title="Dải ngưỡng an toàn của đất."
        description="Thiết lập mức tối thiểu và mức tối đa cho từng thông số, làm căn cứ quét vi phạm tự động khi cảm biến gửi số liệu lên máy chủ."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={handleRestoreDefaults}
              title="Đưa các ngưỡng về giá trị chuẩn nông nghiệp Việt Nam (pH 5.5 - 6.5, EC 300 - 800...)"
            >
              <RotateCcw size={16} aria-hidden="true" /> Khôi phục chuẩn TCVN
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              busy={saving}
              disabled={hasErrors || loading}
              title={hasErrors ? 'Khóa nút lưu do có trường nhập sai logic Min >= Max' : 'Lưu cấu hình vào CSDL'}
            >
              {!saving && <Save size={16} aria-hidden="true" />}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình ngưỡng'}
            </Button>
          </>
        }
      />

      {/* Thông báo Thành công / Lỗi (Step 9 & Step 6a) */}
      {successMessage && <Notice tone="success">{successMessage}</Notice>}

      {errorMessage && <Notice tone="error">{errorMessage}</Notice>}

      {hasErrors && (
        <Notice tone="warning">
          Hệ thống phát hiện giá trị nhập chưa hợp lệ (Min lớn hơn hoặc bằng Max, thiếu số hoặc vượt thang đo vật lý cảm biến). Nút Lưu cấu hình đã tạm thời bị khóa.
        </Notice>
      )}

      {/* Bảng cấu hình ngưỡng (Step 4 & Step 5) */}
      <section className="panel overflow-hidden" aria-labelledby="threshold-list-title" aria-busy={loading}>
        <div className="section-head">
          <h2 id="threshold-list-title">Ngưỡng đang áp dụng</h2>
          {!loading && <span className="muted">{thresholds.length} thông số</span>}
        </div>

        {loading ? (
          <EmptyState loading title="Đang tải ngưỡng…" description="Đang lấy cấu hình ngưỡng từ máy chủ." />
        ) : thresholds.length === 0 ? (
          <EmptyState
            title="Chưa có dải ngưỡng nào"
            description={'Nhấn "Khôi phục chuẩn TCVN" để lấy dải ngưỡng chuẩn nông nghiệp Việt Nam, sau đó nhấn Lưu cấu hình ngưỡng.'}
            action={
              <Button type="button" variant="secondary" onClick={handleRestoreDefaults}>
                <RotateCcw size={16} aria-hidden="true" /> Khôi phục chuẩn TCVN
              </Button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table w-full text-left">
              <caption className="sr-only">Dải ngưỡng tối thiểu, tối đa, đơn vị đo và ý nghĩa nông học của từng thông số đất</caption>
              <thead>
                <tr>
                  <th scope="col" className="min-w-[210px]">Thông số thổ nhưỡng</th>
                  <th scope="col" className="min-w-[150px]">Mức tối thiểu</th>
                  <th scope="col" className="min-w-[150px]">Mức tối đa</th>
                  <th scope="col" className="whitespace-nowrap">Đơn vị đo</th>
                  <th scope="col" className="min-w-[260px]">Ý nghĩa nông học &amp; giới hạn an toàn</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((item) => {
                  const error = validationErrors[item.parameter];
                  return (
                    <tr key={item.parameter} className={error ? 'bg-[#fcf0eb]/55' : undefined}>
                      {/* Tên chỉ số */}
                      <th scope="row" className="font-normal">
                        <div className="font-semibold">{item.name}</div>
                        <div className="muted mt-1 tabular-nums text-xs">{item.parameter}</div>
                      </th>

                      {/* Ô nhập Min */}
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={item.low_limit}
                          onChange={(e) => handleValueChange(item.parameter, 'low_limit', e.target.value)}
                          aria-label={`Mức tối thiểu của ${item.name}`}
                          aria-invalid={error ? 'true' : undefined}
                          className={limitInputClass(Boolean(error))}
                        />
                      </td>

                      {/* Ô nhập Max */}
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={item.high_limit}
                          onChange={(e) => handleValueChange(item.parameter, 'high_limit', e.target.value)}
                          aria-label={`Mức tối đa của ${item.name}`}
                          aria-invalid={error ? 'true' : undefined}
                          className={limitInputClass(Boolean(error))}
                        />
                      </td>

                      {/* Đơn vị đo */}
                      <td className="muted mono-tabular whitespace-nowrap text-sm">{item.unit}</td>

                      {/* Ý nghĩa nông học & Báo lỗi Step 6a */}
                      <td>
                        {error ? (
                          <span className="text-sm font-semibold text-[#994331]">{error}</span>
                        ) : (
                          <span className="muted text-sm leading-relaxed">{item.description}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ghi chú quy tắc nông học */}
      <Notice tone="info">
        <strong>Quy tắc vận hành:</strong> Khi các trạm đo (ESP32 cố định hoặc Máy cầm tay) gửi số liệu lên cổng tiếp nhận, máy chủ sẽ tự động đối chiếu các chỉ số với dải ngưỡng trên. Nếu nồng độ chất trong đất vượt mức trần (Max) hoặc rơi xuống dưới mức sàn (Min), hệ thống sẽ lập tức tạo bản ghi cảnh báo gửi về chuông thông báo cho nông dân.
      </Notice>
    </div>
  );
}
