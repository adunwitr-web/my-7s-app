const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
require('dotenv').config();

const User = require('./models/user');
const Area = require('./models/Area');

const seedData = async () => {
    try {
        const dbUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/green7s';
        console.log('⏳ กำลังเชื่อมต่อไปยัง MongoDB...');
        await mongoose.connect(dbUri);
        console.log('✅ Connected to MongoDB');

        // 1. ล้างข้อมูลเก่า
        await User.deleteMany({});
        await Area.deleteMany({});

        const hashedPassword = await bcrypt.hash('123456', 10);

        // 2. สร้าง Admin ประจำระบบ
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

        // 3. สร้างบัญชีผู้ตรวจประเมินทั้ง 6 ท่าน (เพื่อให้มีบัญชีล็อกอิน)
        const usersToCreate = [
            { username: 'nampen.p', firstName: 'น้ำเพ็ญ', lastName: 'พรหมประสิทธิ์', email: 'nampen.p@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์น้ำเพ็ญ พรหมประสิทธิ์', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' },
            { username: 'sivadol.n', firstName: 'ศิวดล', lastName: 'นวลนภดล', email: 'sivadol.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์ศิวดล นวลนภดล', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' },
            { username: 'pawana.p', firstName: 'ภาวนา', lastName: 'พุ่มไสว', email: 'pawana.p@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์.ดร.ภาวนา พุ่มไสว', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' },
            { username: 'wandee.nu', firstName: 'วันดี', lastName: 'นวนสร้อย', email: 'wandee.nu@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันดี นวนสร้อย', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' },
            { username: 'wanpracha.n', firstName: 'วันประชา', lastName: 'นวนสร้อย', email: 'wanpracha.n@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์วันประชา นวนสร้อย', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' },
            { username: 'pichet.s', firstName: 'พิเชฐ', lastName: 'สุวรรณโณ', email: 'pichet.s@rmutsv.ac.th', fullName: 'ผู้ช่วยศาสตราจารย์พิเชฐ สุวรรณโณ', role: 'Internal Assessor', position: 'ผู้ตรวจประเมิน' }
        ];

        for (const u of usersToCreate) {
            await User.create({
                username: u.username,
                password: hashedPassword,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                fullName: u.fullName,
                role: u.role,
                position: u.position
            });
        }
        console.log('👤 สร้างบัญชีผู้ตรวจประเมินสำเร็จ');

        // 4. อ่านข้อมูลพื้นที่จากไฟล์ Excel
        console.log('⏳ กำลังอ่านข้อมูลพื้นที่จากไฟล์ Excel...');
        const workbook = xlsx.readFile('พื้นที่ตรวจส่งสงขลา.xlsx');
        const sheetName = 'วิทยาลัยรัตภูมิ';
        const sheet = workbook.Sheets[sheetName];
        const excelData = xlsx.utils.sheet_to_json(sheet,{ range: 3 });
        console.log("🔍 ข้อมูลแถวแรกที่อ่านได้จาก Excel คือ:", excelData[0]);

        const areasToInsert = [];
        let currentCategory = 'ทั่วไป'; 

        for (const row of excelData) {
            if (row['ประเภทพื้นที่']) {
                currentCategory = row['ประเภทพื้นที่'].toString().trim();
            }

            if (!row['ห้อง']) continue;

            let personsArray = [];
            if (row['ผู้รับผิดชอบพื้นที่']) {
                personsArray = row['ผู้รับผิดชอบพื้นที่'].toString().split(',').map(name => name.trim());
            }

            areasToInsert.push({
                areaName: row['ห้อง'].toString().trim(),
                category: currentCategory,
                department: 'วิทยาลัยรัตภูมิ',
                building: row['อาคาร'] ? row['อาคาร'].toString().trim() : '',
                areaSize: parseFloat(row['พื้นที่(ตร.ม.)']) || 0,
                seatingCapacity: parseInt(row['จำนวนที่นั่ง(คน)']) || 0,
                maxCapacity: parseInt(row['ความจุสูงสุด(คน)']) || 0,
                responsiblePersons: personsArray, 
                assignedUsers: [adminUser._id] 
            });
        }

        // 5. บันทึกข้อมูลพื้นที่ลง Database
        const createdAreas = await Area.insertMany(areasToInsert);
        console.log(`🏢 นำเข้าข้อมูลพื้นที่จาก Excel สำเร็จจำนวน ${createdAreas.length} ห้อง!`);

        console.log('\n🎉 --- GREEN 7S PLUS SEEDING COMPLETED --- 🎉');
        console.log('📌 รหัสผ่านของทุกคนคือ: 123456');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding Error:', err);
        process.exit(1);
    }
};

seedData();