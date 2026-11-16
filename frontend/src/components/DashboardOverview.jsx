import React from 'react';
import { Radio, Smartphone, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { PageHeader, Button, Badge, EmptyState } from './UI.jsx';
import FieldIllustration from './FieldIllustration.jsx';

export default function DashboardOverview({
  devices = [],
  unreadAlerts = 0,
  pendingRequestsCount = 0,
  onNavigateToDevices,
  onNavigateToAlerts
}) {
  const fixedCount = devices.filter(d => d.type === 'fixed').length;
  const handheldCount = devices.filter(d => d.type === 'handheld').length;
  const unclaimedCount = devices.filter(d => !d.owner_id).length;
  const activeCount = devices.filter(d => d.is_active && (d.provisioning_status || 'active') === 'active').length;
  const totalReadings = devices.reduce((sum, d) => sum + Number(d.total_readings || 0), 0);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Không gian quản trị"
        title="Một góc nhìn toàn hệ thống."
        description="Theo dõi yêu cầu cấp trạm từ nông dân, trạng thái ghép nối và những cảnh báo cần xem lại."
        actions={<Button onClick={onNavigateToDevices}>Quản lý thiết bị <ArrowUpRight size={16} /></Button>}
      />

      {pendingRequestsCount > 0 && (
        <div className="notice notice-warning flex flex-wrap items-center justify-between gap-3" role="status">
          <div>
            Hiện có <strong>{pendingRequestsCount}</strong> yêu cầu cấp trạm mới hoặc xin cấp lại khóa từ nông dân đang chờ phê duyệt.
          </div>
          <Button onClick={onNavigateToDevices}>Xem &amp; duyệt ngay <ArrowUpRight size={15} /></Button>
        </div>
      )}

      <section className="stat-strip" aria-label="Thống kê hệ thống">
        {[
          ['Thiết bị trong hệ thống', devices.length, `${fixedCount} cố định · ${handheldCount} cầm tay · ${pendingRequestsCount} yêu cầu chờ duyệt`],
          ['Hoạt động & nhận dữ liệu', activeCount, `trên tổng số ${devices.length} trạm (${unclaimedCount} ở kho)`],
          ['Bản ghi tích lũy', totalReadings.toLocaleString('vi-VN'), 'bảy thông số chất lượng đất'],
          ['Cảnh báo chờ xử lý', unreadAlerts, 'cần đối chiếu và xác nhận'],
        ].map(([label, value, note]) => (
          <div key={label}>
            <p className="text-xs muted">{label}</p>
            <p className="font-serif text-[42px] leading-none my-3 tabular-nums">{value}</p>
            <p className="text-xs muted">{note}</p>
          </div>
        ))}
      </section>

      <div className="split-layout">
        <section>
          <div className="section-head">
            <div>
              <p className="eyebrow">Mạng lưới quan trắc</p>
              <h2>Những trạm đang quản lý</h2>
            </div>
            <Button variant="ghost" onClick={onNavigateToDevices}>Xem tất cả <ArrowUpRight size={16} /></Button>
          </div>

          {devices.length === 0 ? (
            <EmptyState
              title="Bắt đầu với trạm đầu tiên"
              description="Xuất xưởng thiết bị để tạo Mã thiết bị, Mã PIN kích hoạt cho nông dân và API Key nạp ESP32."
              action={<Button onClick={onNavigateToDevices}>Xuất xưởng thiết bị</Button>}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Thiết bị</th><th>Chủ sở hữu</th><th>Chế độ</th><th>Nhận dữ liệu</th><th>Bản ghi</th></tr>
                </thead>
                <tbody>
                  {devices.slice(0, 6).map(d => (
                    <tr key={d.id}>
                      <td>
                        <div className="font-medium">{d.name}</div>
                        <div className="muted text-xs mono-tabular">
                          {d.hardware_mac ? `MAC: ${d.hardware_mac}` : (d.device_code || `Trạm #${d.id}`)}
                        </div>
                      </td>
                      <td>
                        {d.owner_id ? (
                          <span className="text-xs">{d.owner_name || `User #${d.owner_id}`}</span>
                        ) : (
                          <Badge tone="warning">Chờ nhận (Kho)</Badge>
                        )}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          {d.type === 'fixed' ? <Radio size={15} /> : <Smartphone size={15} />}
                          {d.type === 'fixed' ? 'Cố định' : 'Cầm tay'}
                        </span>
                      </td>
                      <td>
                        {d.provisioning_status === 'pending_approval' ? (
                          <Badge tone="warning">Chờ duyệt</Badge>
                        ) : d.provisioning_status === 'awaiting_activation' ? (
                          <Badge tone="warning">Chờ nhập mã</Badge>
                        ) : d.provisioning_status === 'pairing_open' ? (
                          <Badge tone="warning">Mở ghép nối</Badge>
                        ) : (
                          <Badge tone={d.is_active ? 'success' : 'neutral'}>{d.is_active ? 'Đã bật' : 'Đã tắt'}</Badge>
                        )}
                      </td>
                      <td className="tabular-nums">{Number(d.total_readings || 0).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted text-xs mt-4">
            Nút bật/tắt phản ánh cấu hình tiếp nhận dữ liệu của trạm, không phải trạng thái kết nối phần cứng.
          </p>
        </section>

        <aside className="panel">
          <AlertTriangle size={22} strokeWidth={1.5} className="text-[var(--clay)]" />
          <p className="eyebrow mt-5">Cần chú ý</p>
          <h2>{unreadAlerts > 0 ? unreadAlerts + ' cảnh báo đang chờ.' : 'Không có cảnh báo chờ xử lý.'}</h2>
          <p className="muted text-sm mt-4 mb-6">
            {unreadAlerts > 0
              ? 'Xem thông số vượt ngưỡng, đối chiếu thời điểm đo và ghi nhận biện pháp xử lý.'
              : 'Bạn vẫn có thể mở danh sách để xem lại các cảnh báo đã xác nhận.'}
          </p>
          <Button variant="secondary" onClick={onNavigateToAlerts}>Mở danh sách cảnh báo <ArrowUpRight size={16} /></Button>
          <FieldIllustration className="mt-8" />
        </aside>
      </div>

      <section className="grid md:grid-cols-2 gap-8 border-t border-[var(--line)] pt-7">
        <div className="flex gap-4">
          <Radio size={22} className="shrink-0 mt-1" />
          <div>
            <h3 className="text-base font-medium">Trạm cố định</h3>
            <p className="muted text-sm mt-2">Đo và gửi dữ liệu tự động theo lịch cấu hình trên thiết bị; không có nút bấm đo từ web.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <Smartphone size={22} className="shrink-0 mt-1" />
          <div>
            <h3 className="text-base font-medium">Thiết bị cầm tay</h3>
            <p className="muted text-sm mt-2">Đo bằng nút bấm trên thiết bị, xem kết quả tại chỗ và đồng bộ về máy chủ khi có kết nối.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
