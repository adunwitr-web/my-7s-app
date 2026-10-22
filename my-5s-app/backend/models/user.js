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

    // ห้องที่ผูกกับเจ้าของพื้นที่ (ใช้กำหนด Area.owner) — ไม่ใช้ล็อคผู้ประเมิน
    assignedArea: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },

    // 🔒 ล็อคระดับ "ส่วนพื้นที่ / หมวดหมู่" — ใช้ล็อคสิทธิ์ผู้ประเมิน ("" = ไม่ล็อค)
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
 * แปลงค่าที่ Admin ส่งมา ให้เป็นค่าที่เก็บลง DB
 *  - assignedCategory ที่มีค่า           -> ล็อคทั้งหมวดหมู่นั้น
 *  - เลือกห้อง (assignedArea เป็น id จริง) -> เก็บห้องไว้ (ใช้กำหนดเจ้าของ) และดึงหมวดของห้องมาเป็นการล็อค
 *                                          ถ้าไม่ได้ส่งหมวดมาด้วย
 *  - ทั้งคู่ว่าง                          -> ปลดล็อคทั้งหมด
 *  - รองรับของเก่า: assignedArea เป็นชื่อหมวดหมู่ (ไม่ใช่ ObjectId) -> ถือเป็นการล็อคหมวด
 */
UserSchema.statics.normalizeAssignment = async function (input) {
    input = input || {};
    const Area = mongoose.models.Area || require('./Area');

    const rawArea = idOf(input.assignedArea);
    const rawCat = clean(input.assignedCategory);

    let assignedArea = null;
    let assignedCategory = rawCat;

    if (rawArea && HEX24.test(rawArea)) {
        try {
            const area = await Area.findById(rawArea).select('category').lean();
            if (area) {
                assignedArea = area._id;
                assignedCategory = String(area.category || '').trim() || rawCat;
            }
        } catch (e) { /* ไม่พบห้อง -> ไม่ผูกห้อง */ }
    } else if (rawArea && !rawCat) {
        assignedCategory = rawArea; // ข้อมูลรูปแบบเก่า
    }

    return { assignedArea, assignedCategory };
};

/**
 * แปลงสิทธิ์ของ user เป็นรูปแบบที่ Frontend ใช้ทุกหน้า
 *  { assignedArea: 'idห้อง' | '', assignedAreaName: 'ชื่อห้อง' | '', assignedCategory: 'หมวด' | '' }
 * ถ้าห้องที่ผูกไว้ถูกลบไปแล้ว จะถือว่าไม่มีห้องผูกไว้
 */
UserSchema.statics.describeAssignment = async function (user) {
    user = user || {};
    const Area = mongoose.models.Area || require('./Area');

    let areaId = idOf(user.assignedArea);
    let category = clean(user.assignedCategory);
    let areaName = '';

    if (areaId && HEX24.test(areaId)) {
        try {
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
