const express = require('express');
const router = express.Router();
const FormTemplate = require('../models/FormTemplate');

// ฟังก์ชันสำหรับ Escape อักขระพิเศษใน Regex ป้องกันการค้นหาผิดพลาด
function escapeRegex(text) {
    return text ? String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

// 1. API สำหรับบันทึกแบบฟอร์มใหม่เข้าระบบ (จาก Excel / Admin)
router.post('/upload', async (req, res) => {
    try {
        const { formName, targetAreas, categories, publishMode, publishDate } = req.body;

        const newForm = new FormTemplate({ 
            formName, 
            targetAreas: Array.isArray(targetAreas) ? targetAreas : [targetAreas], 
            categories,
            publishMode: publishMode || 'immediate',
            publishDate: publishDate || null,
            isActive: true // 🟢 ตั้งค่าเป็น true อัตโนมัติ เพื่อให้ค้นหาเจอในระบบผู้ประเมิน
        });
        await newForm.save();

        res.status(200).json({ success: true, message: 'บันทึกแบบฟอร์มใหม่เข้าระบบสำเร็จแล้ว!' });
    } catch (error) {
        console.error('Error saving form:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกแบบฟอร์ม' });
    }
});

// 2. API สำหรับดึงฟอร์มที่ตรงกับประเภทพื้นที่ (สำหรับหน้าผู้ประเมิน)
router.get('/match', async (req, res) => {
    try {
        const { areaType } = req.query; 
        
        if (!areaType) {
            return res.status(400).json({ message: 'กรุณาระบุประเภทพื้นที่' });
        }

        const currentDate = new Date();
        const cleanAreaType = String(areaType).trim();
        const safeRegex = escapeRegex(cleanAreaType);

        // 🟢 2.1 ค้นหาแบบฟอร์มเวอร์ชันล่าสุดที่สถานะพร้อมใช้งาน และชื่อหมวดตรงกัน
        let form = await FormTemplate.findOne({
            $or: [
                { isActive: true },
                { isActive: { $exists: false } }
            ],
            targetAreas: { $regex: new RegExp(safeRegex, 'i') },
            $or: [
                { publishMode: 'immediate' },
                { publishMode: 'scheduled', publishDate: { $lte: currentDate } },
                { publishMode: { $exists: false } }
            ]
        }).sort({ createdAt: -1 });

        // 🟢 2.2 หากไม่เจอแบบตรงตัว ให้ดึงคลังฟอร์มทั้งหมดมาค้นหาแบบยืดหยุ่น (Fuzzy Matching)
        if (!form) {
            const activeForms = await FormTemplate.find({
                $or: [
                    { isActive: true },
                    { isActive: { $exists: false } }
                ],
                $or: [
                    { publishMode: 'immediate' },
                    { publishMode: 'scheduled', publishDate: { $lte: currentDate } },
                    { publishMode: { $exists: false } }
                ]
            }).sort({ createdAt: -1 });

            // แมปชื่อ เช่น "สำนักงาน" เข้ากับ "สำนักงาน และห้องพักอาจารย์"
            form = activeForms.find(f => 
                f.targetAreas && f.targetAreas.some(t => 
                    t.toLowerCase().includes(cleanAreaType.toLowerCase()) || 
                    cleanAreaType.toLowerCase().includes(t.toLowerCase())
                )
            );

            // 🟢 2.3 หากยังหาไม่เจอจริงๆ ให้ใช้แบบฟอร์มล่าสุดที่มีอยู่ในระบบเป็นค่าสำรอง (ป้องกันหน้าเว็บล่ม)
            if (!form && activeForms.length > 0) {
                form = activeForms[0];
            }
        }

        if (!form) {
            return res.status(404).json({ message: 'ไม่พบแบบฟอร์มสำหรับพื้นที่ประเภทนี้' });
        }

        res.status(200).json(form);

    } catch (error) {
        console.error('Error matching form:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลฟอร์ม' });
    }
});

// 3. API สำหรับดึงฟอร์มทั้งหมดในระบบ (สำหรับ Admin)
router.get('/all', async (req, res) => {
    try {
        const forms = await FormTemplate.find().sort({ createdAt: -1 });
        res.status(200).json(forms);
    } catch (error) {
        console.error('Error fetching all forms:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังแบบฟอร์ม' });
    }
});

// 4. API สำหรับดึงฟอร์มล่าสุดแบบทั่วไป
router.get('/current', async (req, res) => {
    try {
        const form = await FormTemplate.findOne().sort({ createdAt: -1 });
        res.status(200).json(form);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลฟอร์ม' });
    }
});

// 5. API ลบแบบฟอร์ม
router.delete('/:id', async (req, res) => {
    try {
        await FormTemplate.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'ลบแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// 6. API เปลี่ยนสถานะเป็น "ใช้งานจริง" (Publish)
router.patch('/:id/publish', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, { 
            publishMode: 'immediate', 
            publishDate: null,
            isActive: true 
        });
        res.status(200).json({ message: 'นำแบบฟอร์มไปใช้งานจริงสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' });
    }
});

// 7. API อัปเดตข้อมูลแบบฟอร์ม (Edit)
router.put('/:id', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, {
            ...req.body,
            isActive: true
        });
        res.status(200).json({ message: 'อัปเดตข้อมูลแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขฟอร์ม' });
    }
});

// 8. API พักการใช้งานแบบฟอร์ม (Pause/Draft)
router.patch('/:id/pause', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, { publishMode: 'draft' });
        res.status(200).json({ message: 'พักการใช้งานแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการพักการใช้งาน' });
    }
});

module.exports = router;