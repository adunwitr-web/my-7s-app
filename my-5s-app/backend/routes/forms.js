const express = require('express');
const router = express.Router();
const FormTemplate = require('../models/FormTemplate');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminOnly = checkRole(['Admin']);

// ทุก endpoint ต้อง Login (Frontend ส่ง Token มาทุกครั้งอยู่แล้ว)
router.use(verifyToken);

// ฟังก์ชันสำหรับ Escape อักขระพิเศษใน Regex ป้องกันการค้นหาผิดพลาด
function escapeRegex(text) {
    return text ? String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

// เงื่อนไข "ฟอร์มพร้อมใช้งาน" — ใช้ $and เพราะเดิมเขียน $or ซ้ำ 2 ครั้งใน object เดียว
// ทำให้เงื่อนไขแรก (isActive) ถูกทับหายไป
function activeFilter(currentDate) {
    return {
        $and: [
            { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
            {
                $or: [
                    { publishMode: 'immediate' },
                    { publishMode: 'scheduled', publishDate: { $lte: currentDate } },
                    { publishMode: { $exists: false } }
                ]
            }
        ]
    };
}

const EDITABLE_FIELDS = ['formName', 'targetAreas', 'categories', 'publishMode', 'publishDate'];

// 1. บันทึกแบบฟอร์มใหม่เข้าระบบ (Admin)
router.post('/upload', adminOnly, async (req, res) => {
    try {
        const { formName, targetAreas, categories, publishMode, publishDate } = req.body;

        const newForm = new FormTemplate({
            formName,
            targetAreas: Array.isArray(targetAreas) ? targetAreas : [targetAreas],
            categories,
            publishMode: publishMode || 'immediate',
            publishDate: publishDate || null,
            isActive: true
        });
        await newForm.save();

        res.status(200).json({ success: true, message: 'บันทึกแบบฟอร์มใหม่เข้าระบบสำเร็จแล้ว!' });
    } catch (error) {
        console.error('Error saving form:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกแบบฟอร์ม' });
    }
});

// 2. ดึงฟอร์มที่ตรงกับประเภทพื้นที่ (สำหรับหน้าผู้ประเมิน)
router.get('/match', async (req, res) => {
    try {
        const { areaType } = req.query;

        if (!areaType) {
            return res.status(400).json({ message: 'กรุณาระบุประเภทพื้นที่' });
        }

        const currentDate = new Date();
        const cleanAreaType = String(areaType).trim();
        const safeRegex = escapeRegex(cleanAreaType);

        // 2.1 ค้นหาเวอร์ชันล่าสุดที่พร้อมใช้งาน และชื่อหมวดตรงกัน
        let form = await FormTemplate.findOne({
            ...activeFilter(currentDate),
            targetAreas: { $regex: new RegExp(safeRegex, 'i') }
        }).sort({ createdAt: -1 });

        // 2.2 ไม่เจอแบบตรงตัว -> ค้นหาแบบยืดหยุ่น (Fuzzy Matching)
        if (!form) {
            const activeForms = await FormTemplate.find(activeFilter(currentDate)).sort({ createdAt: -1 });

            form = activeForms.find(f =>
                f.targetAreas && f.targetAreas.some(t =>
                    String(t).toLowerCase().includes(cleanAreaType.toLowerCase()) ||
                    cleanAreaType.toLowerCase().includes(String(t).toLowerCase())
                )
            );

            // 2.3 ยังไม่เจอ -> ใช้ฟอร์มล่าสุดเป็นค่าสำรอง (ป้องกันหน้าเว็บล่ม)
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

// 3. ดึงฟอร์มทั้งหมดในระบบ (Admin)
router.get('/all', adminOnly, async (req, res) => {
    try {
        const forms = await FormTemplate.find().sort({ createdAt: -1 });
        res.status(200).json(forms);
    } catch (error) {
        console.error('Error fetching all forms:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังแบบฟอร์ม' });
    }
});

// 4. ดึงฟอร์มล่าสุดแบบทั่วไป
router.get('/current', async (req, res) => {
    try {
        const form = await FormTemplate.findOne().sort({ createdAt: -1 });
        res.status(200).json(form);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลฟอร์ม' });
    }
});

// 5. ลบแบบฟอร์ม (Admin)
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        await FormTemplate.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'ลบแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// 6. เปลี่ยนสถานะเป็น "ใช้งานจริง" (Publish) (Admin)
router.patch('/:id/publish', adminOnly, async (req, res) => {
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

// 7. อัปเดตข้อมูลแบบฟอร์ม (Edit) (Admin) — รับเฉพาะฟิลด์ที่แก้ไขได้
router.put('/:id', adminOnly, async (req, res) => {
    try {
        const update = { isActive: true };
        EDITABLE_FIELDS.forEach(f => {
            if (req.body[f] !== undefined) update[f] = req.body[f];
        });
        if (update.targetAreas !== undefined && !Array.isArray(update.targetAreas)) {
            update.targetAreas = [update.targetAreas];
        }

        const form = await FormTemplate.findByIdAndUpdate(req.params.id, { $set: update });
        if (!form) return res.status(404).json({ message: 'ไม่พบแบบฟอร์มนี้ในระบบ' });

        res.status(200).json({ message: 'อัปเดตข้อมูลแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขฟอร์ม' });
    }
});

// 8. พักการใช้งานแบบฟอร์ม (Pause/Draft) (Admin)
router.patch('/:id/pause', adminOnly, async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, { publishMode: 'draft' });
        res.status(200).json({ message: 'พักการใช้งานแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการพักการใช้งาน' });
    }
});

module.exports = router;
