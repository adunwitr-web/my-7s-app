const mongoose = require('mongoose');

const HEX24 = /^[0-9a-fA-F]{24}$/;

function clean(v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (!s || s === 'null' || s === 'undefined' || s.includes('ไม่ล็อค')) return '';
    return s;
}

function idOf(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && v._id) v = v._id;
    return clean(String(v));
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

    // ล็อคระดับ "ห้อง/สถานที่" (เลือกห้องย่อยตอนตั้งสิทธิ์) — null = ไม่ได้ล็อคห้อง
    assignedArea: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },

    // ล็อคระดับ "หมวดหมู่" — ใช้เมื่อเลือกแค่หมวดหมู่ ไม่เลือกห้อง (หรือเก็บหมวดของห้องที่ล็อค)
    // "" = ไม่ล็อคหมวดหมู่
    assignedCategory: { type: String, default: '', trim: true },

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
 * แปลงข้อมูลที่ Frontend ส่งมา ({ assignedArea, assignedCategory }) ให้เป็นค่าที่เก็บลง DB
 *  - assignedArea เป็น ObjectId ของห้องที่มีจริง  -> ล็อคห้อง (+เก็บหมวดของห้องนั้นอัตโนมัติ)
 *  - ไม่มีห้อง แต่มี assignedCategory              -> ล็อคทั้งหมวดหมู่
 *  - ทั้งคู่ว่าง ("" / null / "ไม่ล็อค...")          -> ปลดล็อคทั้งหมด
 *  - (รองรับของเก่า) assignedArea ส่งมาเป็นชื่อหมวดหมู่ที่ไม่ใช่ ObjectId -> ถือเป็นการล็อคหมวดหมู่
 */
UserSchema.statics.normalizeAssignment = async function (input) {
    input = input || {};
    const rawArea = idOf(input.assignedArea);
    const rawCat = clean(input.assignedCategory);

    if (rawArea && HEX24.test(rawArea)) {
        try {
            const Area = mongoose.models.Area || require('./Area');
            const area = await Area.findById(rawArea).select('category').lean();
            if (area) {
                return { assignedArea: area._id, assignedCategory: String(area.category || '').trim() };
            }
        } catch (e) { /* ตกไปใช้หมวดหมู่ด้านล่าง */ }
    }

    const cat = rawCat || (rawArea && !HEX24.test(rawArea) ? rawArea : '');
    return { assignedArea: null, assignedCategory: cat };
};

/**
 * แปลงข้อมูลสิทธิ์ของ user (จาก DB) เป็นรูปแบบที่ Frontend ใช้ (ทุกหน้าใช้ชุดเดียวกัน)
 *  { assignedArea: 'idห้อง' | '', assignedAreaName: 'ชื่อห้อง' | '', assignedCategory: 'หมวด' | '' }
 * ถ้าห้องที่ผูกไว้ถูกลบไปแล้ว (เช่น รัน seed ใหม่) จะถือว่าไม่ได้ล็อคห้อง
 */
UserSchema.statics.describeAssignment = async function (user) {
    user = user || {};
    let areaId = idOf(user.assignedArea);
    let category = clean(user.assignedCategory);
    let areaName = '';

    if (areaId && HEX24.test(areaId)) {
        try {
            const Area = mongoose.models.Area || require('./Area');
            const area = await Area.findById(areaId).select('areaName category').lean();
            if (area) {
                areaName = String(area.areaName || '').trim();
                category = String(area.category || '').trim() || category;
            } else {
                areaId = '';
            }
        } catch (e) {
            areaId = '';
        }
    } else {
        areaId = '';
    }

    return { assignedArea: areaId, assignedAreaName: areaName, assignedCategory: category };
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
