const express = require('express');
const router = express.Router();
const Area = require('../models/Area');
const authModule = require('../middleware/auth');

// ดึง middleware function ยืดหยุ่นรองรับทุกรูปแบบ export
const auth = typeof authModule === 'function' 
    ? authModule 
    : (authModule.auth || authModule.protect || authModule.verifyToken || ((req, res, next) => next()));

// ฟังก์ชันช่วย Escape เครื่องหมายพิเศษสำหรับ Regex
function escapeRegex(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 🟢 GET: ดึงรายการพื้นที่
router.get('/', auth, async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};

        // 1. กรองตาม Category (ถ้ามีการส่งมาจาก Frontend)
        if (category && typeof category === 'string' && category.trim()) {
            query.category = { $regex: new RegExp(escapeRegex(category.trim()), 'i') };
        }

        // 2. ป้องกัน req.user.role เป็น undefined / null
        const userRole = (req.user && req.user.role) ? String(req.user.role) : '';
        const isAdminOrAssessor = userRole === 'Admin' || userRole.includes('Assessor');

        // ถ้าไม่ใช่ Admin หรือ Assessor ให้แสดงเฉพาะห้องที่ตนเองรับผิดชอบ
        if (req.user && !isAdminOrAssessor) {
            const userName = req.user.firstName || req.user.fullName || req.user.username || '';
            const firstName = String(userName).split(' ')[0].replace(/^(ผศ\.|ดร\.|นางสาว|นาง|นาย)/, '').trim();

            const orConditions = [];

            if (req.user._id) {
                orConditions.push({ assignedUsers: req.user._id });
                orConditions.push({ owner: req.user._id });
            }

            if (firstName.length > 0) {
                orConditions.push({ responsiblePersons: { $regex: escapeRegex(firstName), $options: 'i' } });
            }

            if (orConditions.length > 0) {
                query.$or = orConditions;
            }
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