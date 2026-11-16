import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/userRepository.js';

// Quản lý theo dõi thử sai mật khẩu chống Brute-force trong bộ nhớ
// Format: email -> { attempts: number, lockUntil: timestamp }
const loginAttemptTracker = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 phút

export class AuthService {
  constructor() {
    this.userRepo = new UserRepository();
    this.jwtSecret = process.env.JWT_SECRET || 'AgroPrecision_Soil_Telemetry_Secret_Key_2026!';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
  }

  /**
   * UC-01: Đăng ký tài khoản người dùng mới
   */
  async register({ email, password, confirmPassword, fullName }) {
    // 1. Kiểm tra tính hợp lệ dữ liệu nhập
    if (!fullName || !fullName.trim()) {
      const err = new Error('Vui lòng nhập họ và tên của bạn.');
      err.statusCode = 400;
      throw err;
    }

    if (!email || !email.trim()) {
      const err = new Error('Vui lòng nhập địa chỉ email.');
      err.statusCode = 400;
      throw err;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      const err = new Error('Địa chỉ email không đúng định dạng chuẩn.');
      err.statusCode = 400;
      throw err;
    }

    if (!password || password.length < 6) {
      const err = new Error('Mật khẩu phải có độ dài tối thiểu từ 6 ký tự.');
      err.statusCode = 400;
      throw err;
    }

    if (password !== confirmPassword) {
      const err = new Error('Mật khẩu và xác nhận mật khẩu không trùng khớp.');
      err.statusCode = 400;
      throw err;
    }

    // 2. Kiểm tra xem Email đã tồn tại trong CSDL chưa
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      const err = new Error('Email này đã được sử dụng, vui lòng đăng nhập hoặc dùng Email khác.');
      err.statusCode = 409;
      throw err;
    }

    // 3. Băm mật khẩu bằng giải thuật bcrypt cost factor 10
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Tạo tài khoản với vai trò mặc định là 'user' (Nông dân)
    const newUserId = await this.userRepo.create({
      email,
      passwordHash,
      fullName,
      role: 'user'
    });

    const createdUser = await this.userRepo.findById(newUserId);

    return {
      id: createdUser.id,
      email: createdUser.email,
      fullName: createdUser.full_name,
      role: createdUser.role,
      createdAt: createdUser.created_at
    };
  }

  /**
   * UC-02: Đăng nhập hệ thống & phát hành Token JWT
   */
  async login({ email, password }) {
    if (!email || !password) {
      const err = new Error('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      err.statusCode = 400;
      throw err;
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Kiểm tra khóa tạm chống tấn công Brute-force
    const tracker = loginAttemptTracker.get(cleanEmail);
    if (tracker && tracker.lockUntil && Date.now() < tracker.lockUntil) {
      const minutesLeft = Math.ceil((tracker.lockUntil - Date.now()) / (60 * 1000));
      const err = new Error(`Tài khoản đang bị tạm khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau ${minutesLeft} phút.`);
      err.statusCode = 429;
      throw err;
    }

    // 2. Tìm tài khoản trong CSDL
    const user = await this.userRepo.findByEmail(cleanEmail);
    if (!user) {
      this.recordFailedAttempt(cleanEmail);
      const err = new Error('Email hoặc mật khẩu không chính xác.');
      err.statusCode = 401;
      throw err;
    }

    // 3. Kiểm tra mật khẩu băm bằng bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      this.recordFailedAttempt(cleanEmail);
      const currentAttempts = (loginAttemptTracker.get(cleanEmail)?.attempts) || 1;
      const remaining = MAX_FAILED_ATTEMPTS - currentAttempts;

      let msg = 'Email hoặc mật khẩu không chính xác.';
      if (remaining > 0 && remaining <= 3) {
        msg += ` Bạn còn ${remaining} lần thử trước khi tài khoản bị khóa 15 phút.`;
      }
      const err = new Error(msg);
      err.statusCode = 401;
      throw err;
    }

    // Đăng nhập thành công -> Xóa bộ đếm thử sai
    loginAttemptTracker.delete(cleanEmail);

    // 4. Kiểm tra tài khoản có bị tạm khóa không
    if (!user.is_active) {
      const err = new Error('Tài khoản của bạn đã bị Quản trị viên vô hiệu hóa. Vui lòng liên hệ quản trị hệ thống để được hỗ trợ.');
      err.statusCode = 403;
      throw err;
    }

    // 5. Phát hành JSON Web Token (JWT) có thời hạn 8 giờ
    const tokenPayload = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role
    };

    const token = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    };
  }

  /**
   * Ghi nhận lần nhập sai mật khẩu để kích hoạt khóa tạm
   */
  recordFailedAttempt(email) {
    let tracker = loginAttemptTracker.get(email) || { attempts: 0, lockUntil: 0 };
    tracker.attempts += 1;

    if (tracker.attempts >= MAX_FAILED_ATTEMPTS) {
      tracker.lockUntil = Date.now() + LOCK_TIME_MS;
      tracker.attempts = 0; // Reset số lần sau khi áp đặt lệnh khóa
    }

    loginAttemptTracker.set(email, tracker);
  }

  /**
   * Giải mã và xác minh Token JWT
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (err) {
      return null;
    }
  }
}
