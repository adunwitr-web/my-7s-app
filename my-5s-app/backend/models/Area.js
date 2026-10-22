const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    department: {
        type: String,
        required: true,
        trim: true,
        default: 'วิทยาลัยรัตภูมิ'
    },
    areaName: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    building: {
        type: String,
        default: '',
        trim: true
    },

    // 🟢 3 ฟิลด์จาก Excel
    areaSize: {
        type: Number,
        default: 0
    }, // ขนาดพื้นที่ (ตร.ม.)
    seatingCapacity: {
        type: Number,
        default: 0
    }, // จำนวนที่นั่ง
    maxCapacity: {
        type: Number,
        default: 0
    }, // ความจุสูงสุด

    // ✅ เพิ่มฟิลด์ที่ขาดหายไป: routes/user.js, routes/area.js, routes/assessment.js และ populate('owner') ใช้ฟิลด์นี้
    // แต่เดิมไม่มีใน Schema ทำให้ Mongoose ทิ้งค่านี้ (และตัดเงื่อนไข owner ออกจาก query) ทุกครั้ง
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    responsiblePersons: [{
        type: String,
        trim: true
    }],
    assignedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// สร้าง Index ให้ค้นหาข้อมูลได้รวดเร็วขึ้น
areaSchema.index({ department: 1, category: 1 });
areaSchema.index({ responsiblePersons: 'text', areaName: 'text' });

module.exports = mongoose.models.Area || mongoose.model('Area', areaSchema);
