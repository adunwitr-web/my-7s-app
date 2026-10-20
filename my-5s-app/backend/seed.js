const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// นำเข้า Models (ใช้ชื่อตัวเล็กให้ตรงกับไฟล์จริงในโครงการ)
const User = require('./models/user');
const Area = require('./models/Area');

const seedData = async () => {
    try {
        // ดึงค่าการเชื่อมต่อจาก .env (รองรับทั้ง MONGO_URI และ MONGODB_URI)
        const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/my-5s-db';
        
        console.log('⏳ กำลังเชื่อมต่อไปยัง MongoDB...');
        await mongoose.connect(dbUri);
        console.log('✅ Connected to MongoDB for seeding Green 7S Plus...');

        // 1. ล้างข้อมูลเก่าป้องกันข้อมูลซ้ำซ้อน
        await User.deleteMany({});
        await Area.deleteMany({});

        // 2. สร้างรหัสผ่านเข้ารหัส (123456 ให้ทุกคน)
        const hashedPassword = await bcrypt.hash('123456', 10);

        // 3. สร้าง Admin ประจำระบบ
        const adminUser = await User.create({
            username: 'sangthian.j',
            password: hashedPassword,
            firstName: 'แสงเทียน',
            lastName: 'จันทร์แสงทอง',
            email: 'sangthian.j@rmutsv.ac.th',
            fullName: 'นางสาวแสงเทียน จันทร์แสงทอง',
            role: 'Admin',
            position: 'เจ้าหน้าที่'
        });

        // 4. บัญชีผู้ใช้จริงตามอาจารย์สั่ง (เข้าตรวจได้ และเป็นเจ้าของพื้นที่ด้วย)
        const usersToCreate = [
            {
                username: 'nampen.p',
                firstName: 'น้ำเพ็ญ',
                lastName: 'พรหมประสิทธิ์',
                email: 'nampen.p@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์น้ำเพ็ญ พรหมประสิทธิ์',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'ห้องสำนักงาน ผู้อำนวยการ',
                    category: 'สำนักงาน และห้องพักอาจารย์'
                }
            },
            {
                username: 'sivadol.n',
                firstName: 'ศิวดล',
                lastName: 'นวลนภดล',
                email: 'sivadol.n@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์ศิวดล นวลนภดล',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'ห้องพักอาจารย์และห้องสมุด',
                    category: 'ห้องสมุด'
                }
            },
            {
                username: 'pawana.p',
                firstName: 'ภาวนา',
                lastName: 'พุ่มไสว',
                email: 'pawana.p@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์.ดร.ภาวนา พุ่มไสว',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'ห้องเรียนรวม 101 อาคารบรรยาย',
                    category: 'ห้องเรียน'
                }
            },
            {
                username: 'wandee.nu',
                firstName: 'วันดี',
                lastName: 'นวนสร้อย',
                email: 'wandee.nu@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์วันดี นวนสร้อย',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'ห้องปฏิบัติการและวิจัย',
                    category: 'ห้องปฏิบัติการทดลอง'
                }
            },
            {
                username: 'wanpracha.n',
                firstName: 'วันประชา',
                lastName: 'นวนสร้อย',
                email: 'wanpracha.n@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์วันประชา นวนสร้อย',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'โรงฝึกงานเครื่องมือกลและงานเชื่อม',
                    category: 'โรงฝึกงาน'
                }
            },
            {
                username: 'pichet.s',
                firstName: 'พิเชฐ',
                lastName: 'สุวรรณโณ',
                email: 'pichet.s@rmutsv.ac.th',
                fullName: 'ผู้ช่วยศาสตราจารย์พิเชฐ สุวรรณโณ',
                role: 'Internal Assessor',
                position: 'ผู้ตรวจประเมิน',
                areaInfo: {
                    areaName: 'สภาพแวดล้อมและภูมิทัศน์ส่วนกลาง',
                    category: 'ภูมิทัศน์และพื้นที่ส่วนกลาง'
                }
            }
        ];

        // 5. วนลูปสร้าง User และ Area โดยเชื่อม ID ของทั้งสองฝั่งเข้าด้วยกัน
        for (const u of usersToCreate) {
            // สร้าง User
            const createdUser = await User.create({
                username: u.username,
                password: hashedPassword,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                fullName: u.fullName,
                role: u.role,
                position: u.position
            });

            // สร้าง Area และผูก owner ด้วย ID ของ User ที่เพิ่งสร้าง
            const createdArea = await Area.create({
                areaName: u.areaInfo.areaName,
                category: u.areaInfo.category,
                owner: createdUser._id
            });

            // อัปเดต assignedArea ของ User กลับไปด้วย Area ID
            createdUser.assignedArea = createdArea._id;
            await createdUser.save();
        }

        // 6. สร้างพื้นที่ส่วนกลางเพิ่มเติมอื่นๆ
        const adminOwnerId = adminUser._id;
        const extraAreas = [
            { areaName: 'ห้องปฏิบัติการคอมพิวเตอร์ 1', category: 'ห้องปฏิบัติการคอมพิวเตอร์', owner: adminOwnerId },
            { areaName: 'ระบบไฟฟ้าและโครงสร้าง อาคาร 1', category: 'อาคารสถานที่และความปลอดภัยอาคาร', owner: adminOwnerId },
            { areaName: 'โรงอาหารกลางและซุ้มจำหน่ายเครื่องดื่ม', category: 'โรงอาหารและซุ้มอาหาร', owner: adminOwnerId },
            { areaName: 'หอประชุมใหญ่ประจำวิทยาเขต', category: 'ห้องประชุมและหอประชุม', owner: adminOwnerId }
        ];

        await Area.insertMany(extraAreas);

        console.log('👤 All Users Seeded Successfully');
        console.log('🏢 All Areas Seeded Successfully (Green 7S Plus)');
        console.log('\n🎉 --- GREEN 7S PLUS SEEDING COMPLETED --- 🎉');
        console.log('📌 รหัสผ่านของทุกคนคือ: 123456');
        console.log(' - Admin: sangthian.j@rmutsv.ac.th');
        console.log(' - ผู้ตรวจประเมิน 6 ท่าน (ผูกห้องและเข้าใช้งานได้ทั้งสองโหมดทันที)\n');

        process.exit(0);

    } catch (err) {
        console.error('❌ Seeding Error:', err);
        process.exit(1);
    }
};

seedData();