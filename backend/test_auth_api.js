import { AuthService } from './src/services/authService.js';
import { pool } from './src/config/db.js';

async function runTest() {
  console.log('🧪 Bắt đầu kiểm thử nghiệp vụ Auth (UC-01 & UC-02)...');
  const service = new AuthService();

  try {
    // 1. Kiểm thử Đăng ký (UC-01)
    console.log('\n--- 1. Kiểm thử Đăng ký tài khoản Nông dân mới (UC-01) ---');
    const testEmail = `farmer_test_${Date.now()}@soilwatch.vn`;
    const regResult = await service.register({
      fullName: 'Trần Văn Nông Dân Test',
      email: testEmail,
      password: 'Password@123',
      confirmPassword: 'Password@123'
    });
    console.log('✅ Đăng ký thành công tài khoản:', regResult.email);
    console.log('   - ID:', regResult.id);
    console.log('   - Vai trò mặc định:', regResult.role);

    // 2. Thử đăng ký trùng Email
    console.log('\n--- 2. Kiểm thử chống trùng Email ---');
    try {
      await service.register({
        fullName: 'Người khác',
        email: testEmail,
        password: 'Password@123',
        confirmPassword: 'Password@123'
      });
      console.error('❌ Thất bại: Đã không chặn được trùng Email!');
    } catch (err) {
      console.log('✅ Chặn trùng Email thành công:', err.message);
    }

    // 3. Đăng nhập đúng thông tin (UC-02)
    console.log('\n--- 3. Kiểm thử Đăng nhập tài khoản vừa tạo (UC-02) ---');
    const loginResult = await service.login({
      email: testEmail,
      password: 'Password@123'
    });
    console.log('✅ Đăng nhập thành công!');
    console.log('   - Token JWT:', loginResult.token.substring(0, 30) + '...');
    console.log('   - User:', loginResult.user.fullName, `[${loginResult.user.role}]`);

    // 4. Đăng nhập sai mật khẩu
    console.log('\n--- 4. Kiểm thử Đăng nhập sai mật khẩu ---');
    try {
      await service.login({
        email: testEmail,
        password: 'SaiMatKhau123'
      });
      console.error('❌ Thất bại: Cho phép đăng nhập dù sai mật khẩu!');
    } catch (err) {
      console.log('✅ Từ chối mật khẩu sai thành công:', err.message);
    }

    // 5. Đăng nhập tài khoản Quản trị viên mẫu
    console.log('\n--- 5. Kiểm thử Đăng nhập tài khoản Quản trị viên (Admin) ---');
    const adminLogin = await service.login({
      email: 'admin@soilwatch.vn',
      password: 'Admin@123'
    });
    console.log('✅ Đăng nhập Admin thành công:', adminLogin.user.fullName, `[${adminLogin.user.role}]`);

    console.log('\n🎉 TOÀN BỘ KIỂM THỬ BACKEND UC-01 & UC-02 ĐÃ THÀNH CÔNG RỰC RỠ!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err.message);
  } finally {
    await pool.end();
  }
}

runTest();
