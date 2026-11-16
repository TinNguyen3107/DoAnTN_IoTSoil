import React, { useState } from 'react';
import axios from 'axios';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import FieldIllustration from './FieldIllustration.jsx';
import { Button, Field, Notice } from './UI.jsx';

export default function AuthPage({ onLoginSuccess }) {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (isRegisterMode) {
      if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
        setErrorMessage('Vui lòng điền đầy đủ tất cả các trường thông tin.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Mật khẩu và xác nhận mật khẩu không trùng khớp.');
        return;
      }
      try {
        setLoading(true);
        const res = await axios.post('/api/auth/register', {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          confirmPassword
        });
        if (res.data?.success) {
          setSuccessMessage('Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.');
          setIsRegisterMode(false);
          setPassword('');
          setConfirmPassword('');
        }
      } catch (err) {
        setErrorMessage(err.response?.data?.message || 'Đăng ký không thành công.');
      } finally {
        setLoading(false);
      }
    } else {
      if (!email.trim() || !password) {
        setErrorMessage('Vui lòng nhập đầy đủ email và mật khẩu.');
        return;
      }
      try {
        setLoading(true);
        const res = await axios.post('/api/auth/login', { email: email.trim(), password });
        if (res.data?.success) {
          const { token, user } = res.data.data;
          localStorage.setItem('agro_token', token);
          localStorage.setItem('agro_user', JSON.stringify(user));
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          onLoginSuccess(user);
        }
      } catch (err) {
        setErrorMessage(err.response?.data?.message || 'Đăng nhập không thành công.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-story">
        <BrandLogo size={38} />
        <div className="auth-story-copy">
          <div className="eyebrow">Kết nối với khu vườn</div>
          <h1>Hiểu đất.<br />Chăm cây.</h1>
          <p>
            Từ những chỉ số nhỏ trong đất đến quyết định chăm sóc mỗi ngày.
            Theo dõi, ghi chép và nuôi dưỡng mùa vụ của bạn.
          </p>
        </div>
        <FieldIllustration className="auth-landscape" />
        <div className="auth-story-footer">
          <span>Quan trắc đất đa chế độ</span>
          <span>N · P · K · pH · EC</span>
        </div>
      </section>

      <main className="auth-main">
        <div className="auth-form">
          <p className="eyebrow">{isRegisterMode ? 'Tài khoản nông dân' : 'Chào mừng đến AgroPrecision'}</p>
          <h2>{isRegisterMode ? 'Bắt đầu từ khu vườn.' : 'Chào bạn trở lại.'}</h2>
          <p className="auth-intro">
            {isRegisterMode
              ? 'Tạo tài khoản để quản lý trạm đo và theo dõi đất canh tác.'
              : 'Đăng nhập để xem số đo và tiếp nối công việc hôm nay.'}
          </p>

          {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
          {successMessage && <Notice tone="success">{successMessage}</Notice>}

          <form onSubmit={handleSubmit}>
            {isRegisterMode && (
              <Field label="Họ và tên" htmlFor="auth-name">
                <input id="auth-name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required disabled={loading} placeholder="Nhập họ và tên của bạn" />
              </Field>
            )}
            <Field label="Địa chỉ email" htmlFor="auth-email">
              <input id="auth-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading} placeholder="Email của bạn" />
            </Field>
            <Field label="Mật khẩu" htmlFor="auth-password">
              <div className="password-field">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder={isRegisterMode ? 'Tối thiểu 6 ký tự' : 'Nhập mật khẩu'}
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            {isRegisterMode && (
              <Field label="Xác nhận mật khẩu" htmlFor="auth-confirm">
                <input id="auth-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required disabled={loading} placeholder="Nhập lại mật khẩu" />
              </Field>
            )}
            <Button type="submit" busy={loading}>
              {loading ? 'Đang xử lý' : isRegisterMode ? 'Tạo tài khoản' : 'Đăng nhập'}
              {!loading && <ArrowRight size={16} />}
            </Button>
          </form>

          <div className="auth-mode-switch">
            {isRegisterMode ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}
            <button type="button" disabled={loading} onClick={() => { setIsRegisterMode(!isRegisterMode); setErrorMessage(''); setSuccessMessage(''); }}>
              {isRegisterMode ? 'Đăng nhập' : 'Đăng ký mới'}
            </button>
          </div>
          <p className="auth-bottom">
            Tài khoản mới được cấp quyền nông dân.<br />
            Quyền quản trị do quản trị viên hệ thống phân công.
          </p>
        </div>
      </main>
    </div>
  );
}
