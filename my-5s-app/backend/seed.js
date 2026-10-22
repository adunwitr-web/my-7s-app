const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
require('dotenv').config();

const User = require('./models/user');
const Area = require('./models/Area');

const EXCEL_FILE = path.join(__dirname, 'พื้นที่ตรวจส่งสงขลา.xlsx');
const SHEET_NAME = 'วิทยาลัยรัตภูมิ';
const DEFAULT_PASSWORD = '123456';
const DEPARTMENT = 'วิทยาลัยรัตภูมิ';

// ผู้ใช้เริ่มต้น + หมวดรับผิดชอบ (ล็อคระดับ "ส่วนพื้นที่/หมวดหมู่" ห้องย่อยไม่ล็อค)
// categoryKeywords: คำที่ใช้ค้นหาชื่อหมวดจริงจาก Excel (ตรวจก่อน seed ทุกครั้ง)
const ADMIN = {
    username: 'sangthian.j',
    firstName: 'แสงเทียน',
    lastName: 'จันทร์แสงทอง',
    email: 'sangthian.j@rmutsv.ac.th',
    fullName: 'นางสาวแสงเทียน จันทร์แสงทอง',
    position: 'เจ้าหน้าที่'
};

const ASSESSORS = [
    { username: 'nampen.p', firstName: 'น้ำเพ็ญ', lastName: 'พรหมประสิทธิ์', email: 'nampen.p@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์น้ำเพ็ญ พรหมประสิทธิ์', categoryKeywords: ['สำนักงาน'] },
    { username: 'sivadol.n', firstName: 'ศิวดล', lastName: 'นวลนภดล', email: 'sivadol.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์ศิวดล นวลนภดล', categoryKeywords: ['ห้องพักอาจารย์', 'ห้องสมุด'] },
    { username: 'pawana.p', firstName: 'ภาวนา', lastName: 'พุ่มไสว', email: 'pawana.p@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์.ดร.ภาวนา พุ่มไสว', categoryKeywords: ['ห้องเรียน'] },
    { username: 'wandee.nu', firstName: 'วันดี', lastName: 'นวนสร้อย', email: 'wandee.nu@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันดี นวนสร้อย', categoryKeywords: ['ห้องปฏิบัติการ'] },
    { username: 'wanpracha.n', firstName: 'วันประชา', lastName: 'นวนสร้อย', email: 'wanpracha.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันประชา นวนสร้อย', categoryKeywords: ['โรงฝึกงาน'] },
    { username: 'pichet.s', firstName: 'พิเชฐ', lastName: 'สุวรรณโณ', email: 'pichet.s@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์พิเชฐ สุวรรณโณ', categoryKeywords: ['สภาพแวดล้อม', 'ภูมิทัศน์'] }
];

// โครงสร้างไฟล์จริง (แถวหัวตาราง = แถว 4, ข้อมูลเริ่มแถว 5):
//  - คอลัมน์ "ประเภทพื้นที่" มีชื่อหมวดเฉพาะแถวแรกของแต่ละกลุ่ม แถวถัดไปว่าง
//  - คอลัมน์ "ห้อง" มีชื่อห้อง มักมีเลขลำดับนำหน้า เช่น "1. ห้องเรียนมัลติมีเดีย (MS 9302)"
//  - คอลัมน์ "หมายเหตุ" เก็บสถานะห้อง เช่น "*(ปิดใช้ชัวคราว...)" (ไม่ใช่หมวดหมู่)
//  - บางแถวมีอาคาร/พื้นที่แต่ไม่มีชื่อห้อง ระบบจะข้ามและแจ้งไว้

// หาค่าจากคอลัมน์โดยไม่สนใจช่องว่าง (เช่น "พื้นที่ (ตร.ม.)" กับ "พื้นที่(ตร.ม.)")
function getCol(row, name) {
    const target = name.replace(/\s/g, '');
    const key = Object.keys(row).find(k => k.replace(/\s/g, '') === target);
    return key !== undefined && row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
}

function readAreasFromExcel() {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) {
        throw new Error(`ไม่พบชีต "${SHEET_NAME}" ในไฟล์ Excel (มีชีต: ${workbook.SheetNames.slice(0, 5).join(', ')} ...)`);
    }

    // range: 3 = เริ่มอ่านที่แถว 4 (แถวหัวตาราง)
    const excelData = xlsx.utils.sheet_to_json(sheet, { range: 3, defval: null });
    const areas = [];
    const remarks = [];
    const skipped = [];
    let currentCategory = '';

    excelData.forEach((row, idx) => {
        const excelRow = idx + 5;
        const categoryCell = getCol(row, 'ประเภทพื้นที่');
        const roomCell = getCol(row, 'ห้อง');

        if (categoryCell) currentCategory = categoryCell;

        if (!roomCell) {
            const hasOtherData = getCol(row, 'อาคาร') || getCol(row, 'พื้นที่ (ตร.ม.)');
            if (hasOtherData) skipped.push(`แถว ${excelRow}: มีข้อมูลแต่ไม่มีชื่อห้อง`);
            return;
        }
        if (!currentCategory) {
            skipped.push(`แถว ${excelRow}: ไม่มีหมวดหมู่ของห้อง "${roomCell}"`);
            return;
        }

        const cleanName = roomCell.replace(/^\d+\.\s*/, '').trim();
        const remark = getCol(row, 'หมายเหตุ');
        if (remark) remarks.push(`${currentCategory} / ${cleanName}: ${remark}`);

        const personsText = getCol(row, 'ผู้รับผิดชอบพื้นที่');
        areas.push({
            areaName: cleanName,
            category: currentCategory,
            department: DEPARTMENT,
            building: getCol(row, 'อาคาร'),
            areaSize: parseFloat(getCol(row, 'พื้นที่ (ตร.ม.)')) || 0,
            seatingCapacity: parseInt(getCol(row, 'จำนวนที่นั่ง (คน)')) || 0,
            maxCapacity: parseInt(getCol(row, 'ความจุสูงสุด (คน)')) || 0,
            responsiblePersons: personsText ? personsText.split(',').map(n => n.trim()).filter(Boolean) : []
        });
    });

    if (skipped.length) console.warn('⚠️ แถวที่ข้าม:\n  ' + skipped.join('\n  '));
    if (remarks.length) console.log('ℹ️ ห้องที่มีหมายเหตุ (ยังนำเข้าปกติ):\n  ' + remarks.join('\n  '));

    const seen = new Set();
    const dups = [];
    for (const a of areas) {
        const key = `${a.category}||${a.areaName}`;
        if (seen.has(key)) dups.push(`${a.category} / ${a.areaName}`);
        seen.add(key);
    }
    if (dups.length) console.warn('⚠️ ห้องชื่อซ้ำในหมวดเดียวกัน (ควรแก้ใน Excel):\n  ' + dups.join('\n  '));

    return areas;
}

// หาหมวดจริงจากชื่อหมวดใน Excel: ผู้ประเมินหนึ่งคนรับผิดชอบได้หลายหมวด (เก็บทุกหมวดที่ตรงคำค้น)
function resolveAssessorCategories(assessors, categories) {
    const problems = [];
    for (const a of assessors) {
        const matches = categories.filter(c => a.categoryKeywords.some(k => c.includes(k)));
        if (matches.length === 0) {
            problems.push(`• ${a.username}: ไม่พบหมวดที่ตรงกับคำค้น [${a.categoryKeywords.join(', ')}] ใน Excel`);
        }
        a.assignedCategories = matches;
    }
    if (problems.length) {
        throw new Error('ไม่สามารถกำหนดหมวดรับผิดชอบได้ — ยังไม่ได้เขียนข้อมูลใดลงฐานข้อมูล:\n' + problems.join('\n'));
    }
    return assessors;
}

const seedData = async () => {
    try {
        // 1. อ่านและตรวจข้อมูลก่อนทุกอย่าง
        console.log('⏳ กำลังอ่านข้อมูลพื้นที่จาก Excel...');
        const areas = readAreasFromExcel();
        const categories = [...new Set(areas.map(a => a.category))];
        console.log(`📂 พบ ${areas.length} ห้อง ใน ${categories.length} หมวด`);

        resolveAssessorCategories(ASSESSORS, categories);
        ASSESSORS.forEach(a => console.log(`🔒 ${a.username} → ${a.assignedCategories.join(' | ')}`));

        // 2. เชื่อมต่อฐานข้อมูล
        const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/green7s';
        await mongoose.connect(dbUri);
        console.log('✅ Connected to MongoDB');

        // 3. ล้างข้อมูลเดิม
        await User.deleteMany({});
        await Area.deleteMany({});

        const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

        // 4. Admin
        const adminUser = await User.create({
            ...ADMIN,
            password: hashedPassword,
            role: 'Admin'
        });

        // 5. ผู้ตรวจประเมิน (พร้อมหมวดรับผิดชอบ)
        for (const a of ASSESSORS) {
            await User.create({
                username: a.username,
                password: hashedPassword,
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
                fullName: a.fullName,
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedCategories: a.assignedCategories,
                assignedCategory: a.assignedCategories[0] || ''
            });
        }
        console.log('👤 สร้างบัญชีผู้ตรวจประเมินและหมวดรับผิดชอบสำเร็จ');

        // 6. พื้นที่
        const created = await Area.insertMany(areas.map(a => ({ ...a, assignedUsers: [adminUser._id] })));
        console.log(`🏢 นำเข้าพื้นที่สำเร็จ ${created.length} ห้อง`);

        console.log('\n🎉 --- GREEN 7S PLUS SEEDING COMPLETED --- 🎉');
        console.log(`📌 รหัสผ่านของทุกคนคือ: ${DEFAULT_PASSWORD}`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding Error:', err.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    }
};

seedData();
