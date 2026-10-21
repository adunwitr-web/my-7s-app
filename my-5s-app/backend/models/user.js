const mongoose = require('mongoose');

const HEX24 = /^[0-9a-fA-F]{24}$/;

function cleanAssigned(v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s || s === 'null' || s === 'undefined' || s.includes('ไม่ล็อค')) return '';
    return s;
}

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    role: {
        type: String,
        enum: [
            'Admin',
            'Internal Assessor',
            'External Assessor',
            'Area Owner',
            'Internal Assessor & Area Owner',
            'External Assessor & Area Owner'
        ],
        required: true
    },

    // ✅ เก็บ "ชื่อหมวดหมู่พื้นที่" เป็น String (ตรงกับ Dropdown ฝั่ง Admin และหน้า Assessment Form)
    // ค่าว่าง "" = ไม่ล็อค (ประเมินได้ทุกพื้นที่)
    // (เดิมเป็น ObjectId ref Area ทำให้ค่าชื่อหมวดหมู่จาก Dropdown ถูกแปลงเป็น null เสมอ)
    assignedArea: { type: String, default: '', trim: true },

    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    fullName: { type: String, default: '' },
    email: { type: String, required: true },

    position: { type: String, default: '' },
    affiliation: { type: String, default: '' },
    expertise: { type: String, default: '' },
    contactInfo: { type: String, default: '' },

    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

/**
 * แปลงค่า assignedArea ทุกรูปแบบให้เป็น "ชื่อหมวดหมู่ (String)" เสมอ
 *  - null / "" / "null" / "ไม่ล็อค..."  -> ""  (ไม่ล็อค)
 *  - ObjectId หรือ hex 24 ตัว (ข้อมูลเก่าจาก seed) -> ไปดึง category ของ Area นั้น
 *  - object ที่ populate มา -> category / areaName
 *  - String ปกติ -> trim แล้วคืนค่า
 */
UserSchema.statics.resolveAssignedCategory = async function (value) {
    if (value === null || value === undefined) return '';

    let str;
    if (typeof value === 'object') {
        if (value._bsontype || value instanceof mongoose.Types.ObjectId) {
            str = String(value);
        } else {
            return cleanAssigned(value.category || value.areaName || value.name || '');
        }
    } else {
        str = String(value);
    }

    str = cleanAssigned(str);
    if (!str) return '';

    if (HEX24.test(str)) {
        try {
            const Area = mongoose.models.Area || require('./Area');
            const area = await Area.findById(str).select('category').lean();
            return area && area.category ? String(area.category).trim() : '';
        } catch (e) {
            return '';
        }
    }
    return str;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
