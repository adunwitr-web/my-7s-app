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

// แปลงรายการหมวดจากค่าใดก็ได้ (array หรือข้อความคั่นด้วย , หรือ |) ให้เป็นรายการสะอาด ไม่ซ้ำ
function toCategoryList(v) {
    let items = [];
    if (Array.isArray(v)) items = v;
    else if (v !== undefined && v !== null && v !== '') items = String(v).split(/[|,]/);
    const out = [];
    for (const it of items) {
        const c = clean(it);
        if (c && !out.includes(c)) out.push(c);
    }
    return out;
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

    // ห้องที่ผูกกับเจ้าของพื้นที่ (ใช้กำหนด Area.owner)
    assignedArea: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },

    // 🔒 หมวดหมู่ที่รับผิดชอบ (ล็อคผู้ประเมิน) — รองรับหลายหมวด ([] = ไม่ล็อค)
    assignedCategories: { type: [String], default: [] },

    // ค่าเดิมแบบหมวดเดียว เก็บไว้เพื่อความเข้ากันได้ย้อนหลัง (ระบบอ่านจาก assignedCategories ก่อน)
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
 * แปลงค่าที่ Admin ส่งมาให้เป็นค่าที่เก็บลง DB
 *  - assignedCategories : รายการหมวดที่รับผิดชอบ (หรือ assignedCategory แบบเดิม)
 *  - assignedArea       : ห้องที่ผูกกับเจ้าของพื้นที่ (ถ้ามี) — ถ้าไม่ได้ส่งหมวดมา จะใช้หมวดของห้องนั้น
 *                         และถ้ามีหมวดอยู่แล้วจะเพิ่มหมวดของห้องเข้าไปให้ครบ
 */
UserSchema.statics.normalizeAssignment = async function (input) {
    input = input || {};
    const Area = mongoose.models.Area || require('./Area');

    const rawArea = idOf(input.assignedArea);
    const categories = toCategoryList(
        input.assignedCategories !== undefined ? input.assignedCategories : input.assignedCategory
    );
    let assignedArea = null;

    if (rawArea && HEX24.test(rawArea)) {
        try {
            const area = await Area.findById(rawArea).select('category').lean();
            if (area) {
                assignedArea = area._id;
                const roomCat = clean(area.category);
                if (roomCat && !categories.includes(roomCat)) categories.push(roomCat);
            }
        } catch (e) { /* ไม่พบห้อง -> ไม่ผูกห้อง */ }
    } else if (rawArea) {
        // ข้อมูลรูปแบบเก่า: ส่งชื่อหมวดมาในช่องห้อง
        categories.push(...toCategoryList(rawArea));
    }

    return { assignedArea, assignedCategories: toCategoryList(categories) };
};

/**
 * แปลงสิทธิ์ของ user เป็นรูปแบบที่ Frontend ใช้ทุกหน้า
 *  { assignedArea, assignedAreaName, assignedCategories: [..], assignedCategory: 'หมวดแรก' }
 */
UserSchema.statics.describeAssignment = async function (user) {
    user = user || {};
    const Area = mongoose.models.Area || require('./Area');

    let areaId = idOf(user.assignedArea);
    let categories = toCategoryList(user.assignedCategories);
    if (categories.length === 0) categories = toCategoryList(user.assignedCategory);
    let areaName = '';

    if (areaId && HEX24.test(areaId)) {
        try {
            const area = await Area.findById(areaId).select('areaName category').lean();
            if (area) {
                areaName = String(area.areaName || '').trim();
                const roomCat = clean(area.category);
                if (roomCat && !categories.includes(roomCat)) categories.push(roomCat);
            } else {
                areaId = '';
            }
        } catch (e) {
            areaId = '';
        }
    } else {
        areaId = '';
    }

    return {
        assignedArea: areaId,
        assignedAreaName: areaName,
        assignedCategories: categories,
        assignedCategory: categories[0] || ''
    };
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
