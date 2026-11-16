import { SystemConfigRepository } from '../repositories/systemConfigRepository.js';

export class SystemConfigService {
  constructor() {
    this.configRepo = new SystemConfigRepository();
  }

  /**
   * Lấy toàn bộ cấu hình dưới dạng danh sách và dạng key-value map
   */
  async getConfigs() {
    const rows = await this.configRepo.findAll();
    const map = {};
    rows.forEach(r => {
      map[r.cfg_key] = Number(r.cfg_value);
    });
    return { items: rows, map };
  }

  /**
   * Cập nhật danh sách tham số cấu hình
   */
  async updateConfigs(updates) {
    if (!updates || typeof updates !== 'object') {
      throw new Error('Dữ liệu cấu hình không hợp lệ.');
    }

    const rules = {
      UREA_N_PERCENT: { min: 1, max: 100, label: 'Tỷ lệ Đạm trong phân Urê (%)' },
      SUPER_PHOSPHATE_P_PERCENT: { min: 1, max: 100, label: 'Tỷ lệ P2O5 trong Supe Lân (%)' },
      POTASSIUM_CHLORIDE_K_PERCENT: { min: 1, max: 100, label: 'Tỷ lệ K2O trong Kali Clorua (%)' },
      SOIL_DEPTH_M: { min: 0.05, max: 1.0, label: 'Độ sâu tầng đất canh tác (m)' },
      SOIL_BULK_DENSITY: { min: 0.5, max: 2.5, label: 'Dung trọng đất (tấn/m³)' },
      AREA_M2_PER_HA: { min: 1000, max: 100000, label: 'Diện tích quy đổi 1 ha (m²)' }
    };

    for (const [key, val] of Object.entries(updates)) {
      if (!rules[key]) continue;
      const numVal = parseFloat(val);
      const r = rules[key];
      if (isNaN(numVal) || numVal < r.min || numVal > r.max) {
        throw new Error(`Giá trị "${r.label}" không hợp lệ (cho phép từ ${r.min} đến ${r.max}).`);
      }
      await this.configRepo.upsert(key, numVal);
    }

    return await this.getConfigs();
  }
}
