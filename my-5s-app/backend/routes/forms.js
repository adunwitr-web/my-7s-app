const express = require('express');
const router = express.Router();
const FormTemplate = require('../models/FormTemplate');

// API สำหรับรับข้อมูลแบบฟอร์มจาก Excel
router.post('/upload', async (req, res) => {
    try {
        const { formName, targetAreas, categories, publishMode, publishDate} = req.body;

        // ❌ เอาคำสั่ง await FormTemplate.deleteMany({}); ออกไปเลยครับ เพื่อไม่ให้ลบฟอร์มเก่า

        // สร้างฟอร์มใหม่เก็บสะสมในระบบ
        const newForm = new FormTemplate({ 
            formName, 
            targetAreas, 
            categories,
            publishMode,
            publishDate 
        });
        await newForm.save();

        res.status(200).json({ message: 'บันทึกแบบฟอร์มใหม่เข้าระบบสำเร็จแล้ว!' });
    } catch (error) {
        console.error('Error saving form:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกแบบฟอร์ม' });
    }
});

// API สำหรับดึงฟอร์มที่ตรงกับประเภทพื้นที่ (สำหรับหน้าผู้ประเมิน)
router.get('/match', async (req, res) => {
    try {
        const { areaType } = req.query; 
        
        if (!areaType) {
            return res.status(400).json({ message: 'กรุณาระบุประเภทพื้นที่' });
        }

        const currentDate = new Date();

        // ค้นหาฟอร์มที่ตรงกับห้อง และ ต้องมีสถานะพร้อมใช้งานเท่านั้น
        const form = await FormTemplate.findOne({
            isActive: true,
            targetAreas: { $regex: new RegExp(areaType, 'i') },
            $or: [
                { publishMode: 'immediate' }, // ดึงฟอร์มที่ตั้งเป็น "ใช้งานจริง"
                { publishMode: 'scheduled', publishDate: { $lte: currentDate } } // หรือ "ตั้งเวลาไว้" แต่ถึงกำหนดเวลาแล้ว
            ]
        }).sort({ createdAt: -1 }); // ดึงเวอร์ชันล่าสุด

        if (!form) {
            return res.status(404).json({ message: 'ไม่พบแบบฟอร์มสำหรับพื้นที่ประเภทนี้' });
        }

        res.status(200).json(form);
    } catch (error) {
        console.error('Error matching form:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลฟอร์ม' });
    }
});

// API สำหรับให้หน้าผู้ประเมิน ดึงฟอร์มไปแสดงผล
router.get('/current', async (req, res) => {
    try {
        const form = await FormTemplate.findOne(); // ดึงฟอร์มล่าสุด
        res.status(200).json(form);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลฟอร์ม' });
    }
});

router.get('/all', async (req, res) => {
    try {
        // ดึงฟอร์มทั้งหมด เรียงจากใหม่ไปเก่า
        const forms = await FormTemplate.find().sort({ createdAt: -1 });
        res.status(200).json(forms);
    } catch (error) {
        console.error('Error fetching all forms:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังแบบฟอร์ม' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await FormTemplate.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'ลบแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบ' });
    }
});

// 2. API สำหรับเปลี่ยนสถานะเป็น "ใช้งานจริง" (นำไปใช้งาน)
router.patch('/:id/publish', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, { publishMode: 'immediate', publishDate: null });
        res.status(200).json({ message: 'นำแบบฟอร์มไปใช้งานจริงสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' });
    }
});

// 3. API สำหรับอัปเดตข้อมูลเมื่อมีการแก้ไข (Edit)
router.put('/:id', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, req.body);
        res.status(200).json({ message: 'อัปเดตข้อมูลแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขฟอร์ม' });
    }
});

router.patch('/:id/pause', async (req, res) => {
    try {
        await FormTemplate.findByIdAndUpdate(req.params.id, { publishMode: 'draft' });
        res.status(200).json({ message: 'พักการใช้งานแบบฟอร์มสำเร็จ!' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการพักการใช้งาน' });
    }
});

module.exports = router;