const BASE_URL = 'http://127.0.0.1:5000/api';

async function runTest() {
  console.log('========================================================');
  console.log('KIỂM THỬ TỰ ĐỘNG UC-17 (QUẢN TRỊ USER) & UC-18 (PHÂN QUYỀN)');
  console.log('========================================================\n');

  try {
    // 1. Đăng nhập tài khoản Nông Dân
    console.log('1. Đăng nhập Nông Dân...');
    const farmerLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@soilwatch.vn', password: 'Farmer@123' })
    });
    const farmerData = await farmerLogin.json();
    const farmerToken = farmerData.data.token;
    const farmerId = farmerData.data.user.id;
    console.log('   => Nông dân đăng nhập thành công (ID: ' + farmerId + ').\n');

    // 2. KIỂM THỬ UC-17 Alt 3a: Nông dân cố tình truy cập khu vực quản trị
    console.log('2. Kiểm thử UC-17 Alt 3a: Nông dân gọi GET /api/users...');
    const forbiddenRes = await fetch(`${BASE_URL}/users`, {
      headers: { 'Authorization': `Bearer ${farmerToken}` }
    });
    if (forbiddenRes.status === 403) {
      const err = await forbiddenRes.json();
      console.log(`   => [PASS] Alt 3a: Máy chủ từ chối 403: "${err.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng 403 Forbidden nhưng nhận: ${forbiddenRes.status}`);
    }

    // 3. Đăng nhập tài khoản Quản Trị Viên (Admin)
    console.log('3. Đăng nhập Quản Trị Viên...');
    const adminLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@soilwatch.vn', password: 'Admin@123' })
    });
    const adminData = await adminLogin.json();
    const adminToken = adminData.data.token;
    const adminId = adminData.data.user.id;
    const adminHeaders = {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    };
    console.log('   => Admin đăng nhập thành công (ID: ' + adminId + ').\n');

    // 4. KIỂM THỬ UC-17: Lấy danh sách toàn bộ người dùng
    console.log('4. Kiểm thử UC-17 Step 2 & 4: Lấy danh sách người dùng...');
    const listRes = await fetch(`${BASE_URL}/users`, { headers: adminHeaders });
    const listData = await listRes.json();
    if (!listData.success) throw new Error('Lấy danh sách người dùng thất bại');
    console.log(`   - Tổng số tài khoản: ${listData.data.length}`);
    listData.data.forEach(u => {
      console.log(`     * ID #${u.id} - ${u.fullName} (${u.email}) | Vai trò: ${u.role} | Trạng thái: ${u.isActive ? 'Hoạt động' : 'Bị khóa'} | Sở hữu: ${u.devicesCount} trạm`);
    });
    console.log('   => [PASS] Lấy danh sách người dùng kèm số trạm thành công!\n');

    // 5. KIỂM THỬ UC-17 Alt 9a: Admin cố tình khóa tài khoản của chính mình
    console.log('5. Kiểm thử UC-17 Alt 9a: Admin tự khóa chính mình...');
    const selfLockRes = await fetch(`${BASE_URL}/users/${adminId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false })
    });
    if (selfLockRes.status === 400) {
      const err = await selfLockRes.json();
      console.log(`   => [PASS] Alt 9a: Ngăn chặn tự khóa thành công: "${err.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng 400 Bad Request nhưng nhận: ${selfLockRes.status}`);
    }

    // 6. KIỂM THỬ UC-17: Khóa tài khoản Nông dân
    console.log(`6. Kiểm thử khóa tài khoản Nông dân (ID #${farmerId})...`);
    const lockRes = await fetch(`${BASE_URL}/users/${farmerId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: false })
    });
    const lockData = await lockRes.json();
    if (!lockData.success || lockData.data.isActive !== false) throw new Error('Khóa tài khoản thất bại');
    console.log(`   => [PASS] Đã khóa tài khoản thành công.\n`);

    // Kiểm tra Nông dân bị khóa không đăng nhập được
    console.log('   - Thử đăng nhập lại bằng tài khoản vừa bị khóa...');
    const reLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'farmer@soilwatch.vn', password: 'Farmer@123' })
    });
    if (reLogin.status === 403) {
      const err = await reLogin.json();
      console.log(`   => [PASS] Đăng nhập bị chặn chính xác: "${err.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng 403 Forbidden khi bị khóa nhưng nhận: ${reLogin.status}`);
    }

    // 7. Mở khóa lại tài khoản Nông dân
    console.log(`7. Mở khóa lại tài khoản Nông dân (ID #${farmerId})...`);
    const unlockRes = await fetch(`${BASE_URL}/users/${farmerId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ isActive: true })
    });
    const unlockData = await unlockRes.json();
    if (!unlockData.success || unlockData.data.isActive !== true) throw new Error('Mở khóa thất bại');
    console.log(`   => [PASS] Mở khóa tài khoản thành công.\n`);

    // 8. KIỂM THỬ UC-18 Alt 7a: Phân quyền vai trò không hợp lệ
    console.log('8. Kiểm thử UC-18 Alt 7a: Gán vai trò không hợp lệ ("super_hacker")...');
    const invalidRoleRes = await fetch(`${BASE_URL}/users/${farmerId}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'super_hacker' })
    });
    if (invalidRoleRes.status === 400) {
      const err = await invalidRoleRes.json();
      console.log(`   => [PASS] Alt 7a: Từ chối vai trò sai: "${err.message}"\n`);
    } else {
      throw new Error(`Kỳ vọng mã lỗi 400 nhưng nhận: ${invalidRoleRes.status}`);
    }

    // 9. KIỂM THỬ UC-18: Nâng quyền Nông dân thành Quản Trị Viên (Admin)
    console.log(`9. Kiểm thử UC-18: Nâng quyền Nông dân (ID #${farmerId}) lên Admin...`);
    const promoteRes = await fetch(`${BASE_URL}/users/${farmerId}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'admin' })
    });
    const promoteData = await promoteRes.json();
    if (!promoteData.success || promoteData.data.role !== 'admin') throw new Error('Nâng quyền thất bại');
    console.log(`   => [PASS] Đã nâng quyền thành công: vai trò mới là "${promoteData.data.role}".\n`);

    // 10. Hạ quyền trở lại thành Nông dân (farmer)
    console.log(`10. Hạ quyền trở lại thành Nông dân (farmer)...`);
    const demoteRes = await fetch(`${BASE_URL}/users/${farmerId}/role`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ role: 'farmer' })
    });
    const demoteData = await demoteRes.json();
    if (!demoteData.success || demoteData.data.role !== 'farmer') throw new Error('Hạ quyền thất bại');
    console.log(`   => [PASS] Đã hoàn trả vai trò "${demoteData.data.role}" thành công.\n`);

    console.log('========================================================');
    console.log('TẤT CẢ CÁC CA KIỂM THỬ UC-17 & UC-18 ĐÃ VƯỢT QUA 100%!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ KIỂM THỬ THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runTest();
