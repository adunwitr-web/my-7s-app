const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    department: {
        type: String,
        required: true,
        trim: true,
        default: 'วิทยาลัยรัตภูมิ'
    }, // คณะ / หน่วยงาน เช่น "วิทยาลัยรัตภูมิ", "คณะวิศวกรรมศาสตร์"

    areaName: {
        type: String,
        required: true,
        trim: true
    }, // ชื่อห้อง/สถานที่ เช่น "4. สาขาศึกษาทั่วไป (MS 9404)"

    category: {
        type: String,
        required: true,
        trim: true
    }, // ประเภทพื้นที่ เช่น "ห้องเรียน", "ห้องพักอาจารย์", "สำนักงาน" (ปลด enum เพื่อความยืดหยุ่น)

    building: {
        type: String,
        default: '',
        trim: true
    }, // อาคาร เช่น "อาคารมงคลศรีวิชัย"

    // ✅ เพิ่มฟิลด์ที่ขาดหายไป: seed.js / area.js / user.js / populate('owner') ใช้ฟิลด์นี้
    // แต่เดิมไม่มีใน Schema ทำให้ Mongoose ทิ้งค่านี้ทุกครั้ง
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    responsiblePersons: [{
        type: String,
        trim: true
    }], // รายชื่อผู้รับผิดชอบจาก Excel เช่น ["ผศ.ภาวนา", "ผศ.อัมรินทร์"]

    assignedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }], // อ้างอิง ID ผู้ใช้งานในระบบ Mongoose (รองรับได้หลายคน)

    isActive: {
        type: Boolean,
        default: true
    } // สถานะเปิด/ปิดการใช้งานพื้นที่
}, { timestamps: true });

// สร้าง Index ให้ค้นหาข้อมูลได้รวดเร็วขึ้น
areaSchema.index({ department: 1, category: 1 });
areaSchema.index({ responsiblePersons: 'text', areaName: 'text' });

module.exports = mongoose.models.Area || mongoose.model('Area', areaSchema);
