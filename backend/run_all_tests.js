import { spawn } from 'child_process';

const tests = [
  'test_auth_api.js',
  'test_device_api.js',
  'test_threshold_api.js',
  'test_alerts_api.js',
  'test_history_csv_api.js',
  'test_field_events_api.js',
  'test_recommendations_api.js',
  'test_user_admin_api.js',
  'test_final_polish.js'
];

async function runSingleTest(testFile) {
  return new Promise((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`▶ CHẠY TEST: ${testFile}`);
    console.log(`======================================================`);
    const proc = spawn('node', [testFile], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Test ${testFile} failed with code ${code}`));
    });
  });
}

async function main() {
  console.log('🚀 BẮT ĐẦU CHẠY TOÀN BỘ KIỂM THỬ HỆ THỐNG AGROPRECISION IOT (TẤT CẢ UC 01 - 18)');
  for (const t of tests) {
    try {
      await runSingleTest(t);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log('\n🎉🎉🎉 TẤT CẢ 8 BỘ KIỂM THỬ (18 USE CASES) ĐÃ THÀNH CÔNG 100%! 🎉🎉🎉');
  process.exit(0);
}

main();
