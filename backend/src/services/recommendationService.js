import { CropRepository } from '../repositories/cropRepository.js';
import { ReadingRepository } from '../repositories/readingRepository.js';
import { DeviceRepository } from '../repositories/deviceRepository.js';
import { SystemConfigRepository } from '../repositories/systemConfigRepository.js';

export class RecommendationService {
  constructor() {
    this.cropRepo = new CropRepository();
    this.readingRepo = new ReadingRepository();
    this.deviceRepo = new DeviceRepository();
    this.configRepo = new SystemConfigRepository();
  }

  /**
   * Lấy danh mục tất cả giống cây trồng
   */
  async getAllCrops() {
    return await this.cropRepo.findAll();
  }

  /**
   * UC-15: Tư vấn định lượng phân bón NPK thương phẩm (Urê, Super Lân, Kali Clorua)
   */
  async calculateFertilizerRecommendation({ deviceId, cropId, area = 1, unit = 'ha', currentUser }) {
    if (!deviceId) throw new Error('Vui lòng chọn trạm quan trắc.');
    if (!cropId) throw new Error('Vui lòng chọn giống cây trồng mục tiêu.');

    const device = await this.deviceRepo.findById(Number(deviceId));
    if (!device) throw new Error('Không tìm thấy trạm đo tương ứng.');

    const crop = await this.cropRepo.findById(Number(cropId));
    if (!crop) throw new Error('Không tìm thấy thông tin giống cây trồng.');

    // Nông dân chỉ được tra cứu trạm của mình
    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền truy cập dữ liệu trạm quan trắc này.');
      err.statusCode = 403;
      throw err;
    }

    // Lấy số đo mới nhất của trạm đo
    const latestReading = await this.readingRepo.findLatestByDeviceId(device.id);
    if (!latestReading) {
      throw new Error(`Trạm "${device.name}" chưa có bản ghi số đo chất lượng đất nào.`);
    }

    // Tính toán nhu cầu chuẩn mục tiêu của cây (lấy trung bình khoảng tối ưu)
    const targetN = (Number(crop.n_min) + Number(crop.n_max)) / 2;
    const targetP = (Number(crop.p2o5_min) + Number(crop.p2o5_max)) / 2;
    const targetK = (Number(crop.k2o_min) + Number(crop.k2o_max)) / 2;

    const currentN = Number(latestReading.n);
    const currentP = Number(latestReading.p);
    const currentK = Number(latestReading.k);

    // Tính chênh lệch thiếu hụt (mg/kg đất)
    const deltaN = Math.max(0, targetN - currentN);
    const deltaP = Math.max(0, targetP - currentP);
    const deltaK = Math.max(0, targetK - currentK);

    // Đọc cấu hình tham số nông học từ DB (system_configs)
    const configRows = await this.configRepo.findAll();
    const cfg = {};
    configRows.forEach(r => { cfg[r.cfg_key] = Number(r.cfg_value); });

    const soilDepth = cfg['SOIL_DEPTH_M'] || 0.2;
    const bulkDensity = cfg['SOIL_BULK_DENSITY'] || 1.3;
    const areaHaM2 = cfg['AREA_M2_PER_HA'] || 10000;
    const mgKgToKgHaFactor = soilDepth * bulkDensity * (areaHaM2 / 1000);

    const ureaRatio = (cfg['UREA_N_PERCENT'] || 46) / 100;
    const superPRatio = (cfg['SUPER_PHOSPHATE_P_PERCENT'] || 16) / 100;
    const kclRatio = (cfg['POTASSIUM_CHLORIDE_K_PERCENT'] || 60) / 100;

    // Quy đổi từ nồng độ (mg/kg) sang khối lượng nguyên chất tương đương trên 1 ha
    const deltaN_kg_ha = deltaN * mgKgToKgHaFactor;
    const deltaP_kg_ha = deltaP * mgKgToKgHaFactor;
    const deltaK_kg_ha = deltaK * mgKgToKgHaFactor;

    // Tính hệ số diện tích canh tác
    const numArea = parseFloat(area);
    if (isNaN(numArea) || numArea <= 0) {
      const err = new Error('Diện tích canh tác không hợp lệ (phải là số lớn hơn 0).');
      err.statusCode = 400;
      throw err;
    }
    let areaFactor = 1.0;
    let unitLabel = 'Hecta (ha)';

    if (unit === 'sao_bac_bo') {
      areaFactor = (numArea * 360) / areaHaM2;
      unitLabel = `${numArea} Sào Bắc Bộ (360 m²/sào)`;
    } else if (unit === 'sao_trung_bo') {
      areaFactor = (numArea * 500) / areaHaM2;
      unitLabel = `${numArea} Sào Trung Bộ (500 m²/sào)`;
    } else if (unit === 'm2') {
      areaFactor = numArea / areaHaM2;
      unitLabel = `${numArea} m²`;
    } else {
      areaFactor = numArea;
      unitLabel = `${numArea} Hecta (ha)`;
    }

    // UC-15 Alt 6a: Đất đã đủ hoặc dư thừa dinh dưỡng NPK so với nhu cầu cây
    const isSurplusN = deltaN <= 0;
    const isSurplusP = deltaP <= 0;
    const isSurplusK = deltaK <= 0;
    const isTotallySurplus = isSurplusN && isSurplusP && isSurplusK;

    // Quy đổi ra phân bón thương mại theo tỷ lệ trong system_configs
    const ureaKg = isSurplusN ? 0 : Number(((deltaN_kg_ha * areaFactor) / ureaRatio).toFixed(1));
    const superPhosphateKg = isSurplusP ? 0 : Number(((deltaP_kg_ha * areaFactor) / superPRatio).toFixed(1));
    const potassiumChlorideKg = isSurplusK ? 0 : Number(((deltaK_kg_ha * areaFactor) / kclRatio).toFixed(1));

    // Lịch phân chia các đợt bón
    const schedule = [
      {
        stage: 'Bón lót (Làm đất / Trước khi gieo trồng)',
        timing: 'Khi cày xới, trộn đều vào tầng đất canh tác',
        urea: Number((ureaKg * 0.2).toFixed(1)),
        superPhosphate: superPhosphateKg, // 100% bón lót
        potassiumChloride: Number((potassiumChlorideKg * 0.3).toFixed(1)),
        notes: 'Giúp bộ rễ non hấp thụ lân để ra rễ nhanh, hạn chế nghẹt rễ'
      },
      {
        stage: 'Bón thúc đợt 1 (Đẻ nhánh / Ra cành lá mới)',
        timing: 'Sau khi cây bén rễ hồi xanh (15 - 20 ngày sau trồng)',
        urea: Number((ureaKg * 0.4).toFixed(1)),
        superPhosphate: 0,
        potassiumChloride: Number((potassiumChlorideKg * 0.35).toFixed(1)),
        notes: 'Kích thích phát triển sinh khối thân lá mạnh mẽ'
      },
      {
        stage: 'Bón thúc đợt 2 (Làm đòng / Đón hoa / Nuôi quả)',
        timing: 'Giai đoạn phân hóa mầm hoa hoặc đậu quả non',
        urea: Number((ureaKg * 0.4).toFixed(1)),
        superPhosphate: 0,
        potassiumChloride: Number((potassiumChlorideKg * 0.35).toFixed(1)),
        notes: 'Tăng trọng lượng hạt/củ/quả, củng cố độ ngọt và năng suất'
      }
    ];

    let adviceMessage = '';
    if (isTotallySurplus) {
      adviceMessage = `Đất tại trạm "${device.name}" hiện đang rất giàu dinh dưỡng, vượt quá nhu cầu chuẩn của ${crop.name}. Khuyến nghị KHÔNG bón thêm phân hóa học để tránh lãng phí chi phí và hạn chế nguy cơ ngộ độc rễ.`;
    } else {
      const parts = [];
      if (isSurplusN) parts.push('Đạm (N) đã đủ');
      if (isSurplusP) parts.push('Lân (P) đã đủ');
      if (isSurplusK) parts.push('Kali (K) đã đủ');
      const surplusNote = parts.length > 0 ? ` (${parts.join(', ')} - không cần bón thêm)` : '';
      adviceMessage = `Khuyến nghị bổ sung phân bón cân đối cho diện tích ${unitLabel}${surplusNote} nhằm đạt năng suất tối ưu cho ${crop.name}.`;
    }

    return {
      device: { id: device.id, name: device.name },
      crop: { id: crop.id, name: crop.name },
      area: { value: numArea, unit, label: unitLabel },
      currentValues: {
        n: currentN,
        p: currentP,
        k: currentK,
        ph: Number(latestReading.ph),
        ec: Number(latestReading.ec)
      },
      targetValues: {
        n: targetN,
        p2o5: targetP,
        k2o: targetK,
        phMin: Number(crop.ph_min),
        phMax: Number(crop.ph_max)
      },
      deltaNutrient: {
        n: Number(deltaN.toFixed(1)),
        p: Number(deltaP.toFixed(1)),
        k: Number(deltaK.toFixed(1))
      },
      isTotallySurplus,
      adviceMessage,
      fertilizers: {
        urea: ureaKg,
        superPhosphate: superPhosphateKg,
        potassiumChloride: potassiumChlorideKg
      },
      schedule
    };
  }

  /**
   * UC-16: Xem gợi ý giống cây trồng phù hợp với đặc tính thổ nhưỡng hiện tại (Top 3)
   */
  async recommendSuitableCrops({ deviceId, currentUser }) {
    if (!deviceId) throw new Error('Vui lòng chọn trạm quan trắc.');

    const device = await this.deviceRepo.findById(Number(deviceId));
    if (!device) throw new Error('Không tìm thấy trạm đo tương ứng.');

    if (currentUser && currentUser.role !== 'admin' && device.owner_id !== currentUser.id) {
      const err = new Error('Bạn không có quyền truy cập dữ liệu trạm quan trắc này.');
      err.statusCode = 403;
      throw err;
    }

    const latestReading = await this.readingRepo.findLatestByDeviceId(device.id);
    if (!latestReading) {
      throw new Error(`Trạm "${device.name}" chưa có bản ghi số đo để đánh giá tương thích cây trồng.`);
    }

    const allCrops = await this.cropRepo.findAll();
    if (allCrops.length === 0) {
      throw new Error('Danh mục cây trồng trong cơ sở dữ liệu hiện đang trống.');
    }

    const currentPh = Number(latestReading.ph);
    const currentEc = Number(latestReading.ec);
    const currentN = Number(latestReading.n);
    const currentP = Number(latestReading.p);
    const currentK = Number(latestReading.k);

    // Thuật toán Heuristic đa tiêu chí chấm điểm tương thích (0 - 100 điểm)
    const evaluatedCrops = allCrops.map((crop) => {
      let phScore = 0;
      let ecScore = 0;
      let npkScore = 0;
      const pros = [];
      const cons = [];

      // 1. Chấm điểm pH (Tối đa 40 điểm)
      if (currentPh >= crop.ph_min && currentPh <= crop.ph_max) {
        phScore = 40;
        pros.push(`Độ pH đất (${currentPh}) nằm trong dải tối ưu (${crop.ph_min} - ${crop.ph_max})`);
      } else {
        const diffPh = Math.min(Math.abs(currentPh - crop.ph_min), Math.abs(currentPh - crop.ph_max));
        if (diffPh <= 0.3) {
          phScore = 30;
          pros.push(`Độ pH đất (${currentPh}) gần tiệm cận dải thích hợp`);
        } else if (diffPh <= 0.6) {
          phScore = 20;
          cons.push(currentPh < crop.ph_min ? `Đất hơi chua so với cây (pH hiện tại ${currentPh})` : `Đất hơi kiềm so với cây`);
        } else if (diffPh <= 1.0) {
          phScore = 10;
          cons.push(currentPh < crop.ph_min ? `Đất chua rõ rệt (cần bón vôi)` : `Đất kiềm hóa`);
        } else {
          phScore = 0;
          cons.push(`pH đất (${currentPh}) không thích hợp với cây (${crop.ph_min} - ${crop.ph_max})`);
        }
      }

      // 2. Chấm điểm độ mặn EC (Tối đa 20 điểm)
      if (currentEc <= crop.ec_max * 0.7) {
        ecScore = 20;
        pros.push(`Độ dẫn điện EC (${currentEc} µS/cm) hoàn toàn an toàn, đất ngọt`);
      } else if (currentEc <= crop.ec_max) {
        ecScore = 15;
        pros.push(`Độ mặn EC trong ngưỡng chịu đựng tốt của cây (≤ ${crop.ec_max} µS/cm)`);
      } else if (currentEc <= crop.ec_max * 1.2) {
        ecScore = 8;
        cons.push(`Độ mặn EC chớm vượt ngưỡng chịu đựng, cần tưới xả mặn`);
      } else {
        ecScore = 0;
        cons.push(`Đất nhiễm mặn (${currentEc} µS/cm) vượt quá ngưỡng chịu đựng (${crop.ec_max} µS/cm)`);
      }

      // 3. Chấm điểm dinh dưỡng NPK hiện hữu (Tối đa 40 điểm: N 15, P 10, K 15)
      // Đạm (N)
      if (currentN >= crop.n_min * 0.8 && currentN <= crop.n_max * 1.2) {
        npkScore += 15;
        pros.push(`Hàm lượng Đạm N (${currentN} mg/kg) đáp ứng tốt nhu cầu`);
      } else if (currentN >= crop.n_min * 0.5) {
        npkScore += 8;
      } else {
        cons.push(`Hàm lượng Đạm hơi thấp (${currentN} mg/kg), cần bổ sung phân lót`);
      }

      // Lân (P)
      if (currentP >= crop.p2o5_min * 0.8 && currentP <= crop.p2o5_max * 1.2) {
        npkScore += 10;
        pros.push(`Lân P (${currentP} mg/kg) sẵn sàng cho rễ phát triển`);
      } else if (currentP >= crop.p2o5_min * 0.5) {
        npkScore += 5;
      } else {
        cons.push(`Hàm lượng Lân nghèo, cần bón Super lân lót`);
      }

      // Kali (K)
      if (currentK >= crop.k2o_min * 0.8 && currentK <= crop.k2o_max * 1.2) {
        npkScore += 15;
        pros.push(`Kali K (${currentK} mg/kg) dồi dào, cây khỏe kháng bệnh`);
      } else if (currentK >= crop.k2o_min * 0.5) {
        npkScore += 8;
      } else {
        cons.push(`Hàm lượng Kali thấp, cần bổ sung Kali clorua`);
      }

      const totalScore = Math.min(100, phScore + ecScore + npkScore);

      return {
        id: crop.id,
        name: crop.name,
        description: crop.description,
        score: totalScore,
        phRange: `${crop.ph_min} - ${crop.ph_max}`,
        ecMax: crop.ec_max,
        nRange: `${crop.n_min} - ${crop.n_max}`,
        pRange: `${crop.p2o5_min} - ${crop.p2o5_max}`,
        kRange: `${crop.k2o_min} - ${crop.k2o_max}`,
        pros: pros.slice(0, 3),
        cons: cons.slice(0, 2)
      };
    });

    // Lọc các cây đạt điểm từ 50 trở lên (Step 4)
    const qualifyingCrops = evaluatedCrops.filter(c => c.score >= 50);

    // UC-16 Alt 4a: Không có cây trồng nào đạt điểm phù hợp tối thiểu (Điểm < 50)
    if (qualifyingCrops.length === 0) {
      let amendmentAdvice = 'Đất hiện tại có tính chất nông học bất lợi nghiêm trọng: ';
      if (currentPh < 5.0) {
        amendmentAdvice += `Độ chua pH=${currentPh} quá thấp (đất chua phèn). Khuyến cáo bón vôi nông nghiệp Dolomite hoặc vôi bột (300 - 500 kg/ha) trước khi xuống giống ít nhất 15 ngày.`;
      } else if (currentEc > 1200) {
        amendmentAdvice += `Độ mặn EC=${currentEc} µS/cm quá cao (đất nhiễm mặn). Khuyến cáo mở rãnh thoát nước, bơm tiêu thau chua rửa mặn bằng nước ngọt trước khi gieo trồng.`;
      } else {
        amendmentAdvice += 'Đất rất nghèo dinh dưỡng NPK tổng hợp. Cần cày xới và bón lót phân hữu cơ ủ hoai mục (3 - 5 tấn/ha) để phục hồi độ phì nhiêu.';
      }

      return {
        device: { id: device.id, name: device.name },
        currentSoil: {
          ph: currentPh,
          ec: currentEc,
          n: currentN,
          p: currentP,
          k: currentK
        },
        needsSoilAmendment: true,
        amendmentAdvice,
        topCrops: []
      };
    }

    // Sắp xếp giảm dần theo điểm tương thích và chọn Top 3
    qualifyingCrops.sort((a, b) => b.score - a.score);
    const top3 = qualifyingCrops.slice(0, 3);

    return {
      device: { id: device.id, name: device.name },
      currentSoil: {
        ph: currentPh,
        ec: currentEc,
        n: currentN,
        p: currentP,
        k: currentK
      },
      needsSoilAmendment: false,
      amendmentAdvice: null,
      topCrops: top3
    };
  }
}
