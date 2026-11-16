import dotenv from 'dotenv';
import app from './app.js';
import { testDbConnection } from './config/db.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Khởi động server
const startServer = async () => {
  try {
    await testDbConnection();
    app.listen(PORT, () => {
      console.log(`🚀 AgroPrecision Server đang chạy tại http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Không thể khởi động server do lỗi kết nối Database:', err.message);
    process.exit(1);
  }
};

startServer();