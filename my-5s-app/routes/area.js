const express = require('express');
const router = express.Router();
const Area = require('../models/Area');
const authModule = require('../middleware/auth');

// ดึง middleware function ไม่ว่าใน auth.js จะ export มาแบบไหน (module.exports =, { auth }, หรือ { protect })
const auth = typeof authModule === 'function' 
    ? authModule 
    : (authModule.auth || authModule.protect || authModule.verifyToken);

// 🟢 GET: ดึงรายการพื้นที่ (รองรับทั้งแบบดึงทั้งหมด และแบบกรองตาม Category/อาจารย์ผู้รับผิดชอบ)
router.get('/', auth, async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};

        // 1. ถ้ามีการส่ง category มาจาก Frontend ให้เพิ่มเงื่อนไขการค้นหา
        if (category) {
            query.category = { $regex: new RegExp(category.trim(), 'i') };
        }

        // 2. ถ้าผู้ใช้ล็อกอินเข้ามา และไม่ใช่ Admin/Assessor ให้แสดงเฉพาะห้องที่ตนเองรับผิดชอบ
        if (req.user && req.user.role !== 'Admin' && !req.user.role.includes('Assessor')) {
            const userName = req.user.firstName || req.user.fullName || req.user.username || '';
            const firstName = userName.split(' ')[0].replace(/^(ผศ\.|ดร\.|นางสาว|นาง|นาย)/, '').trim();

            query.$or = [
                { responsiblePersons: { $regex: firstName, $options: 'i' } },
                { assignedUsers: req.user._id },
                { owner: req.user._id }
            ];
        }

        const areas = await Area.find(query)
            .populate('owner', 'username firstName lastName email')
            .populate('assignedUsers', 'username firstName lastName email');

        res.json(areas);
    } catch (err) {
        console.error('Error fetching areas:', err);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลพื้นที่', error: err.message });
    }
});

// 🟢 POST: เพิ่มพื้นที่ใหม่
router.post('/', auth, async (req, res) => {
    try {
        const { department, areaName, category, building, responsiblePersons, owner } = req.body;
        
        const newArea = new Area({ 
            department: department || 'วิทยาลัยรัตภูมิ',
            areaName, 
            category, 
            building: building || '',
            responsiblePersons: responsiblePersons || [],
            owner 
        });

        await newArea.save();
        res.status(201).json({ message: 'เพิ่มพื้นที่สำเร็จ', area: newArea });
    } catch (err) {
        res.status(400).json({ message: 'ไม่สามารถเพิ่มพื้นที่ได้', error: err.message });
    }
});

module.exports = router;