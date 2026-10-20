const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Area = require('./models/Area');
require('dotenv').config();

async function importExcelData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ เชื่อมต่อ MongoDB สำเร็จ');

        const workbook = XLSX.readFile('./พื้นที่ตรวจส่งสงขลา.xlsx');
        let totalInserted = 0;

        // วนลูปอ่านทุก Sheet (ยกเว้น Sheet แรก)
        for (const sheetName of workbook.SheetNames) {
            if (sheetName === 'เสนอรายชื่อพัฒนา From') continue;

            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            let currentCategory = '';
            const unitName = sheetName; // ชื่อคณะ/หน่วยงานตามชื่อ Sheet

            for (let i = 3; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                // คอลัมน์ 0: ประเภทพื้นที่, คอลัมน์ 1: ห้อง, คอลัมน์ 2: อาคาร, คอลัมน์ 6: ผู้รับผิดชอบ
                if (row[0] && typeof row[0] === 'string' && !row[0].includes('ฐานข้อมูล')) {
                    currentCategory = row[0].trim();
                }

                const roomName = row[1];
                const building = row[2];
                const responsible = row[6];

                if (roomName && typeof roomName === 'string') {
                    // แยกรายชื่อผู้รับผิดชอบถ้ามีหลายคน (เช่น ผศ.ภาวนา, ผศ.อัมรินทร์)
                    const persons = responsible 
                        ? String(responsible).split(/[,/\n]/).map(p => p.trim()).filter(Boolean)
                        : [];

                    await Area.create({
                        department: unitName,
                        areaType: currentCategory || 'ทั่วไป',
                        roomName: roomName.trim(),
                        building: building ? String(building).trim() : '',
                        responsiblePersons: persons
                    });
                    totalInserted++;
                }
            }
        }

        console.log(`🎉 นำเข้าข้อมูลห้องสำเร็จทั้งหมด ${totalInserted} ห้อง!`);
        mongoose.connection.close();
    } catch (err) {
        console.error('❌ เกิดข้อผิดพลาด:', err);
    }
}

importExcelData();