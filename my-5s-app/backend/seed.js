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

        // 1. สร้างรหัสผ่านเข้ารหัส
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

        // 3. สร้างพื้นที่ตัวอย่างครบทุกหมวดหมู่ของ Green 7S Plus (11 หมวดหมู่)
        const areaList = [
            { areaName: 'สำนักงานเลขานุการ คณะฯ', category: 'สำนักงาน และห้องพักอาจารย์', owner: owner1._id },
            { areaName: 'ห้องเรียนรวม 101 อาคารบรรยาย', category: 'ห้องเรียน', owner: owner1._id },
            { areaName: 'ห้องปฏิบัติการคอมพิวเตอร์ 1', category: 'ห้องปฏิบัติการคอมพิวเตอร์', owner: owner2._id },
            { areaName: 'ห้องปฏิบัติการเคมี G01', category: 'ห้องปฏิบัติการทดลอง', owner: owner2._id },
            { areaName: 'โรงฝึกงานเครื่องมือกลและงานเชื่อม', category: 'โรงฝึกงาน', owner: owner2._id },
            { areaName: 'ห้องปฏิบัติการการโรงแรมและการบริการ', category: 'ห้องปฏิบัติการวิชาชีพ', owner: owner1._id },
            { areaName: 'ห้องสมุดและศูนย์สารสนเทศ', category: 'ห้องสมุด', owner: owner1._id },
            { areaName: 'ระบบไฟฟ้าและโครงสร้าง อาคาร 1', category: 'อาคารสถานที่และความปลอดภัยอาคาร', owner: owner2._id },
            { areaName: 'ลานกิจกรรมและสวนหย่อมส่วนกลาง', category: 'ภูมิทัศน์และพื้นที่ส่วนกลาง', owner: owner1._id },
            { areaName: 'โรงอาหารกลางและซุ้มจำหน่ายเครื่องดื่ม', category: 'โรงอาหารและซุ้มอาหาร', owner: owner1._id },
            { areaName: 'หอประชุมใหญ่ประจำวิทยาเขต', category: 'ห้องประชุมและหอประชุม', owner: owner1._id }
        ];

        const createdAreas = await Area.insertMany(areaList);
        console.log(`🏢 Created ${createdAreas.length} Areas Successfully (Green 7S Plus)`);

        // 4. สร้าง Admin และ ผู้ประเมิน (ผูก assignedArea ให้พร้อมเข้าประเมินได้ทันที)
        await User.create({
            username: 'admin',
            password: hashedPassword,
            firstName: 'ผู้ดูแล',
            lastName: 'ระบบ',
            email: 'admin@5s.com',
            fullName: 'ผู้ดูแลระบบ (Admin)',
            role: 'Admin'
        });

        await User.create({
            username: 'eval_internal',
            password: hashedPassword,
            firstName: 'สมชาย',
            lastName: 'ใจดี',
            email: 'somchai@5s.com',
            fullName: 'ผศ.ดร.สมชาย ใจดี',
            role: 'Internal Assessor',
            position: 'อาจารย์ประจำสาขา',
            assignedArea: createdAreas[0]._id // ผูกไว้ที่สำนักงาน
        });

        await User.create({
            username: 'eval_external',
            password: hashedPassword,
            firstName: 'วิชัย',
            lastName: 'ประเมินดี',
            email: 'wichai@5s.com',
            fullName: 'ดร.วิชัย ประเมินดี',
            role: 'External Assessor',
            department: 'คณะวิทยาศาสตร์ มหาวิทยาลัยคู่เคียง'
        });

        console.log('👤 All Users Seeded Successfully');
        console.log('\n🎉 --- GREEN 7S PLUS SEEDING COMPLETED --- 🎉');
        console.log('📌 บัญชีทดสอบระบบ (Password ทั้งหมดคือ: 123456)');
        console.log(' - Admin: admin');
        console.log(' - Internal Assessor: eval_internal (เข้าตรวจห้องสำนักงานได้ทันที)');
        console.log(' - External Assessor: eval_external');
        console.log(' - Area Owner: owner_office, owner_lab\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding Error:', err);
        process.exit(1);
    }
};

seedData();