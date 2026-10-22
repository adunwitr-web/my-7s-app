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
    { username: 'sivadol.n', firstName: 'ศิวดล', lastName: 'นวลนภดล', email: 'sivadol.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์ศิวดล นวลนภดล', categoryKeywords: ['ห้องพักอาจารย์'] },
    { username: 'pawana.p', firstName: 'ภาวนา', lastName: 'พุ่มไสว', email: 'pawana.p@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์.ดร.ภาวนา พุ่มไสว', categoryKeywords: ['ห้องเรียน'] },
    { username: 'wandee.nu', firstName: 'วันดี', lastName: 'นวนสร้อย', email: 'wandee.nu@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันดี นวนสร้อย', categoryKeywords: ['ห้องปฏิบัติการ'] },
    { username: 'wanpracha.n', firstName: 'วันประชา', lastName: 'นวนสร้อย', email: 'wanpracha.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันประชา นวนสร้อย', categoryKeywords: ['โรงฝึกงาน'] },
    { username: 'pichet.s', firstName: 'พิเชฐ', lastName: 'สุวรรณโณ', email: 'pichet.s@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์พิเชฐ สุวรรณโณ', categoryKeywords: ['สภาพแวดล้อม', 'ภูมิทัศน์'] }
];

// อ่านพื้นที่จาก Excel (ทำก่อนลบข้อมูลเดิม เพื่อให้ไฟล์ผิดพลาดไม่ทำให้ฐานข้อมูลว่างเปล่า)
function readAreasFromExcel() {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const sheet = workbook.Sheets[SHEET_NAME];
    if (!sheet) {
        throw new Error(`ไม่พบชีต "${SHEET_NAME}" ในไฟล์ Excel (มีชีต: ${workbook.SheetNames.join(', ')})`);
    }

    const excelData = xlsx.utils.sheet_to_json(sheet, { range: 3 });
    const areas = [];
    let currentCategory = 'ทั่วไป';

    for (const row of excelData) {
        if (row['ประเภทพื้นที่']) {
            currentCategory = row['ประเภทพื้นที่'].toString().trim();
        }
        if (!row['ห้อง']) continue;

        const persons = row['ผู้รับผิดชอบพื้นที่']
            ? row['ผู้รับผิดชอบพื้นที่'].toString().split(',').map(n => n.trim()).filter(Boolean)
            : [];

        areas.push({
            areaName: row['ห้อง'].toString().trim(),
            category: currentCategory,
            department: DEPARTMENT,
            building: row['อาคาร'] ? row['อาคาร'].toString().trim() : '',
            areaSize: parseFloat(row['พื้นที่(ตร.ม.)']) || 0,
            seatingCapacity: parseInt(row['จำนวนที่นั่ง(คน)']) || 0,
            maxCapacity: parseInt(row['ความจุสูงสุด(คน)']) || 0,
            responsiblePersons: persons
        });
    }
    return areas;
}

// หาหมวดจริงจากชื่อหมวดใน Excel ตามคำค้น — ถ้าไม่พบ/พบหลายหมวด จะแจ้งให้ตรวจ
function resolveAssessorCategories(assessors, categories) {
    const problems = [];
    for (const a of assessors) {
        const matches = categories.filter(c => a.categoryKeywords.some(k => c.includes(k)));
        if (matches.length === 0) {
            problems.push(`• ${a.username}: ไม่พบหมวดที่ตรงกับคำค้น [${a.categoryKeywords.join(', ')}] ใน Excel`);
        } else if (matches.length > 1) {
            console.warn(`⚠️ ${a.username}: พบหลายหมวด [${matches.join(' | ')}] ระบบจะล็อคหมวดแรก "${matches[0]}" กรุณาตรวจสอบ`);
        }
        a.assignedCategory = matches[0] || '';
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
        ASSESSORS.forEach(a => console.log(`🔒 ${a.username} → ${a.assignedCategory}`));

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
                assignedCategory: a.assignedCategory
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