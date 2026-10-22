const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const areaRouter = require('./routes/area');
require('dotenv').config();

const app = express();


// อนุญาตให้หน้าเว็บจากโดเมนหรือพอร์ตอื่น (เช่น 5500) เรียกใช้งาน API ได้
app.use(cors());
app.use('/api/areas', areaRouter);
// อนุญาตให้ Frontend เรียกใช้ API ได้โดยไม่ติด CORS


app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/my-5s-db')
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/assessment', require('./routes/assessment'));
app.use('/api/areas', require('./routes/area'));
app.use('/api/area', require('./routes/area')); // 🟢 สำรองเส้นนี้ไว้ป้องกัน 404
app.use('/api/user', require('./routes/user'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/system-config', require('./routes/systemConfig'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});