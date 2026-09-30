const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Area = require('./models/Area');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/my-5s-db');
        console.log('✅ Connected to MongoDB for seeding Green 7S Plus...');

        // ล้างข้อมูลเก่า
        await User.deleteMany({});
        await Area.deleteMany({});

        // 1. สร้างรหัสผ่านเข้ารหัส (123456 ให้ทุกคน)
        const hashedPassword = await bcrypt.hash('123456', 10);

        // 2. สร้าง Area Owner ตัวอย่างก่อน เพื่อเอา _id ไปผูกกับห้อง
        const owner1 = await User.create({
            username: 'owner_office',
            password: hashedPassword,
            firstName: 'นภา',
            lastName: 'รักสะอาด',
            email: 'napha@5s.com',
            fullName: 'นางสาวนภา รักสะอาด',
            role: 'Area Owner',
            position: 'เจ้าหน้าที่บริหารงานทั่วไป'
        });

        const owner2 = await User.create({
            username: 'owner_lab',
            password: hashedPassword,
            firstName: 'กิตติศักดิ์',
            lastName: 'คุมแล็บ',
            email: 'kittisak@5s.com',
            fullName: 'นายกิตติศักดิ์ คุมแล็บ',
            role: 'Area Owner',
            position: 'นักวิทยาศาสตร์'
        });

        // 3. สร้างพื้นที่ตัวอย่างครบทุกหมวดหมู่ของ Green 7S Plus
        const areaList = [
            { areaName: 'ห้องสำนักงาน ผู้อำนวยการ', category: 'สำนักงาน และห้องพักอาจารย์', owner: owner1._id }, // [0] ผศ.น้ำเพ็ญ
            { areaName: 'ห้องพักอาจารย์และห้องสมุด', category: 'ห้องสมุด', owner: owner1._id },                 // [1] ผศ.ศิวดล
            { areaName: 'ห้องเรียนรวม 101 อาคารบรรยาย', category: 'ห้องเรียน', owner: owner1._id },             // [2] ผศ.ดร.ภาวนา
            { areaName: 'ห้องปฏิบัติการและวิจัย', category: 'ห้องปฏิบัติการทดลอง', owner: owner2._id },           // [3] ผศ.วันดี
            { areaName: 'โรงฝึกงานเครื่องมือกลและงานเชื่อม', category: 'โรงฝึกงาน', owner: owner2._id },       // [4] ผศ.วันประชา
            { areaName: 'สภาพแวดล้อมและภูมิทัศน์ส่วนกลาง', category: 'ภูมิทัศน์และพื้นที่ส่วนกลาง', owner: owner1._id }, // [5] ผศ.พิเชฐ
            { areaName: 'ห้องปฏิบัติการคอมพิวเตอร์ 1', category: 'ห้องปฏิบัติการคอมพิวเตอร์', owner: owner2._id },
            { areaName: 'ระบบไฟฟ้าและโครงสร้าง อาคาร 1', category: 'อาคารสถานที่และความปลอดภัยอาคาร', owner: owner2._id },
            { areaName: 'โรงอาหารกลางและซุ้มจำหน่ายเครื่องดื่ม', category: 'โรงอาหารและซุ้มอาหาร', owner: owner1._id },
            { areaName: 'หอประชุมใหญ่ประจำวิทยาเขต', category: 'ห้องประชุมและหอประชุม', owner: owner1._id }
        ];

        const createdAreas = await Area.insertMany(areaList);
        console.log(`🏢 Created ${createdAreas.length} Areas Successfully (Green 7S Plus)`);

        // 4. บัญชีผู้ใช้จริงตามที่อาจารย์สั่ง (Password: 123456 ทุกคน)
        const realUsers = [
            // เจ้าหน้าที่ (Admin)
            {
                username: 'sangthian.j',
                password: hashedPassword,
                firstName: 'แสงเทียน',
                lastName: 'จันทร์แสงทอง',
                email: 'sangthian.j@rmutsv.ac.th',
                fullName: 'นางสาวแสงเทียน จันทร์แสงทอง',
                role: 'Admin',
                position: 'เจ้าหน้าที่'
            },
            // ผู้ตรวจ 1: ผศ.น้ำเพ็ญ -> ห้องสำนักงาน ผู้อำนวยการ
            {
                username: 'nampen.p',
                password: hashedPassword,
                firstName: 'น้ำเพ็ญ',
                lastName: 'พรหมประสิทธิ์',
                email: 'nampen.p@rmusv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์น้ำเพ็ญ พรหมประสิทธิ์',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[0]._id
            },
            // ผู้ตรวจ 2: ผศ.ศิวดล -> ห้องพักอาจารย์และห้องสมุด
            {
                username: 'sivadol.n',
                password: hashedPassword,
                firstName: 'ศิวดล',
                lastName: 'นวลนภดล',
                email: 'sivadol.n@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์ศิวดล นวลนภดล',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[1]._id
            },
            // ผู้ตรวจ 3: ผศ.ดร.ภาวนา -> ห้องเรียน
            {
                username: 'pawana.p',
                password: hashedPassword,
                firstName: 'ภาวนา',
                lastName: 'พุ่มไสว',
                email: 'pawana.p@rmusv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์.ดร.ภาวนา พุ่มไสว',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[2]._id
            },
            // ผู้ตรวจ 4: ผศ.วันดี -> ห้องปฏิบัติการ
            {
                username: 'wandee.nu',
                password: hashedPassword,
                firstName: 'วันดี',
                lastName: 'นวนสร้อย',
                email: 'wandee.nu@rmusv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์วันดี นวนสร้อย',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[3]._id
            },
            // ผู้ตรวจ 5: ผศ.วันประชา -> โรงฝึกงาน
            {
                username: 'wanpracha.n',
                password: hashedPassword,
                firstName: 'วันประชา',
                lastName: 'นวนสร้อย',
                email: 'wanpracha.n@rmusv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์วันประชา นวนสร้อย',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[4]._id
            },
            // ผู้ตรวจ 6: ผศ.พิเชฐ -> สภาพแวดล้อม
            {
                username: 'pichet.s',
                password: hashedPassword,
                firstName: 'พิเชฐ',
                lastName: 'สุวรรณโณ',
                email: 'pichet.s@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์พิเชฐ สุวรรณโณ',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                assignedArea: createdAreas[5]._id
            }
        ];

        await User.insertMany(realUsers);

        console.log('👤 All Users Seeded Successfully');
        console.log('\n🎉 --- GREEN 7S PLUS SEEDING COMPLETED --- 🎉');
        console.log('📌 รหัสผ่านของทุกคนคือ: 123456');
        console.log(' - Admin: sangthian.j@rmutsv.ac.th');
        console.log(' - ผู้ตรวจประเมิน 6 ท่าน (เข้าตรวจห้องที่ได้รับมอบหมายได้ทันที)\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding Error:', err);
        process.exit(1);
    }
};

seedData();