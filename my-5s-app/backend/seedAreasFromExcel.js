const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Area = require('./models/Area');
require('dotenv').config();

async function importExcelData() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/my-5s-db');
        console.log('✅ เชื่อมต่อ MongoDB สำเร็จ');

        // 1. ล้างข้อมูล Area ขยะเก่าทิ้งทั้งหมด
        await Area.deleteMany({});
        console.log('🗑️ ล้างข้อมูลพื้นที่เดิมทั้งหมดเรียบร้อยแล้ว');

        const workbook = XLSX.readFile('./พื้นที่ตรวจส่งสงขลา.xlsx');
        let totalInserted = 0;

        for (const sheetName of workbook.SheetNames) {
            if (sheetName.includes('เสนอรายชื่อ') || sheetName.includes('Form')) continue;

            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            let currentCategory = 'สำนักงาน';
            const unitName = String(sheetName).trim();

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const col0 = row[0] ? String(row[0]).trim() : '';
                const col1 = row[1] ? String(row[1]).trim() : '';

                // ตรวจหาหัวข้อหมวดหมู่ใหญ่ (เช่น "สำนักงาน", "ห้องเรียน")
                if (col0 && !col1 && !col0.includes('ฐานข้อมูล') && !col0.includes('ลำดับ') && col0.length > 1) {
                    currentCategory = col0.replace(/^\d+[\.\s]*/, '').trim();
                    continue;
                }

                let rawRoomName = col1 || (col0 && !col0.includes('ฐานข้อมูล') ? col0 : '');
                if (!rawRoomName) continue;

                // คลีนชื่อห้อง: ตัดตัวเลขลำดับข้างหน้าออก (เช่น "1. สำนักงานคณบดี" -> "สำนักงานคณบดี")
                let cleanRoomName = String(rawRoomName)
                    .replace(/^\d+[\.\s]*/, '')
                    .trim();

                // ข้ามชื่อที่เป็นแถวหัวข้อ หรือชื่อหมวดซ้ำ
                const invalidNames = ['สำนักงาน', 'ห้อง', 'ห้องเรียน', 'ห้องปฏิบัติการ', 'อาคารและโรงฝึกงาน', 'ห้องสมุด', 'สภาพแวดล้อมภายในอาคาร', 'สภาพแวดล้อมภายนอกอาคาร', 'ชื่อห้อง', 'รายการ', 'สถานที่', 'ลำดับ'];
                if (invalidNames.includes(cleanRoomName) || cleanRoomName.length < 2) {
                    continue;
                }

                const buildingRaw = row[2] ? String(row[2]).trim() : '';
                const responsibleRaw = row[6] || row[5] || row[3] || '';

                const persons = responsibleRaw
                    ? String(responsibleRaw).split(/[,/\n]/).map(p => p.trim()).filter(Boolean)
                    : [];

                await Area.create({
                    department: unitName || 'วิทยาลัยรัตภูมิ',
                    areaName: cleanRoomName,
                    category: currentCategory || 'ทั่วไป',
                    building: buildingRaw,
                    responsiblePersons: persons
                });

                totalInserted++;
            }
        }

        console.log(`🎉 ล้างข้อมูลขยะสำเร็จ และนำเข้าห้องที่ถูกต้องเรียบร้อยแล้วทั้งหมด ${totalInserted} ห้อง!`);
        mongoose.connection.close();
    } catch (err) {
        console.error('❌ เกิดข้อผิดพลาด:', err);
        if (mongoose.connection.readyState !== 0) {
            mongoose.connection.close();
        }
    }
}

importExcelData();