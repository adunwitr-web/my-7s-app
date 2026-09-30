const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // กำหนดสิทธิ์ 4 ระดับ ตามเอกสารออกแบบระบบ
    role: {
        type: String,
        enum: ['Admin', 'Internal Assessor', 'External Assessor', 'Area Owner'],
        required: true
    },

    assignedArea: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Area',
        default: null // ถ้าไม่มีให้เป็น null
    },
    // ข้อมูลทั่วไป (ใช้ร่วมกัน)
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true }, // สำหรับส่งแจ้งเตือน

    // ข้อมูลเฉพาะของ Internal Assessor และ Area Owner
    position: { type: String }, // ตำแหน่งทางวิชาการ/บริหาร

    // ข้อมูลเฉพาะของ External Assessor (ผู้ประเมินภายนอก)
    affiliation: { type: String }, // หน่วยงานต้นสังกัด
    expertise: { type: String }, // ความเชี่ยวชาญ
    contactInfo: { type: String }, // ข้อมูลติดต่อเพิ่มเติม (เบอร์โทร, ฯลฯ)

    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);