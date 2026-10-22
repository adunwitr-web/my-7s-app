const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// อนุญาตให้หน้าเว็บจากโดเมนหรือพอร์ตอื่น (เช่น GitHub Pages / Live Server 5500) เรียกใช้งาน API ได้
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/my-5s-db')
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Health check (ใช้ปลุก Render / ตรวจว่าเซิร์ฟเวอร์ทำงาน)
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/areas', require('./routes/area'));
app.use('/api/area', require('./routes/area')); // 🟢 สำรองเส้นนี้ไว้ป้องกัน 404
app.use('/api/user', require('./routes/user'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/system-config', require('./routes/systemConfig'));

// API ที่ไม่มีอยู่จริง -> ตอบ JSON (แทน HTML) เพื่อให้ Frontend อ่านข้อความได้
app.use('/api', (req, res) => {
    res.status(404).json({ message: `ไม่พบ API: ${req.method} ${req.originalUrl}` });
});

// กัน JSON พัง / ข้อผิดพลาดที่ไม่คาดคิด ไม่ให้เซิร์ฟเวอร์ตอบ HTML
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.message);
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    res.status(status).json({ message: status === 400 ? 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' : 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
