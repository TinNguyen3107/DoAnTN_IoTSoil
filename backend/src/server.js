import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testDbConnection } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import readingRoutes from './routes/readingRoutes.js';
import thresholdRoutes from './routes/thresholdRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import fieldEventRoutes from './routes/fieldEventRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';
import userRoutes from './routes/userRoutes.js';
import systemConfigRoutes from './routes/systemConfigRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/thresholds', thresholdRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/field-events', fieldEventRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/system-configs', systemConfigRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'AgroPrecision Soil Telemetry API',
    timestamp: new Date().toISOString()
  });
});

// Xử lý Route không tồn tại
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Đường dẫn API không tồn tại.' });
});

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
