const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Area = require('../models/Area');
const User = require('../models/user');
const { verifyToken, checkRole } = require('../middleware/auth');

// ฟังก์ชันช่วย Escape เครื่องหมายพิเศษสำหรับ Regex
function escapeRegex(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 🟢 GET: ดึงรายการพื้นที่
router.get('/', verifyToken, async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};

        // 1. กรองตาม Category (ถ้ามีการส่งมาจาก Frontend)
        if (category && typeof category === 'string' && category.trim()) {
            query.category = { $regex: new RegExp(escapeRegex(category.trim()), 'i') };
        }

        // 2. ตรวจสอบสิทธิ์: Admin / Assessor เห็นทุกพื้นที่, เจ้าของพื้นที่เห็นเฉพาะที่เกี่ยวข้อง
        const userRole = req.user && req.user.role ? String(req.user.role) : '';
        const isAdminOrAssessor = userRole === 'Admin' || userRole.includes('Assessor');

        if (!isAdminOrAssessor) {
            const userId = req.user.userId;
            const orConditions = [];

            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                orConditions.push({ assignedUsers: userId });
                orConditions.push({ owner: userId });

                const me = await User.findById(userId).select('firstName assignedArea assignedCategory').lean();
                if (me) {
                    const lock = await User.describeAssignment(me);
                    if (lock.assignedArea) {
                        // เจ้าของห้อง: เห็นเฉพาะห้องของตัวเอง (ไม่เห็นห้องอื่นในหมวดเดียวกัน)
                        orConditions.push({ _id: lock.assignedArea });
                    } else {
                        // ไม่ได้ผูกห้อง: เห็นทุกห้องในหมวดที่รับผิดชอบ
                        if (lock.assignedCategory && !lock.assignedCategory.includes('ไม่ล็อค')) {
                            orConditions.push({ category: { $regex: new RegExp(escapeRegex(lock.assignedCategory), 'i') } });
                        }
                        const firstName = String(me.firstName || '').replace(/^(ผศ\.|ดร\.|นางสาว|นาง|นาย)/, '').trim();
                        if (firstName.length > 0) {
                            orConditions.push({ responsiblePersons: { $regex: escapeRegex(firstName), $options: 'i' } });
                        }
                    }
                }
            }

            if (orConditions.length === 0) return res.json([]);
            query.$or = orConditions;
        }

        // 3. ดึงข้อมูลแบบปลอดภัย (ถ้า populate พัง ให้ดึงเฉพาะข้อมูลหลักแทน เซิร์ฟเวอร์จะไม่ล่ม)
        let areas = [];
        try {
            areas = await Area.find(query)
                .populate('owner', 'username firstName lastName email')
                .populate('assignedUsers', 'username firstName lastName email')
                .exec();
        } catch (populateErr) {
            console.warn('⚠️ Populate failed, fetching raw areas:', populateErr.message);
            areas = await Area.find(query).exec();
        }

        res.set('Cache-Control', 'no-store');
        return res.json(areas);

    } catch (err) {
        console.error('❌ Error fetching areas:', err);
        return res.status(500).json({
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลพื้นที่',
            error: err.message
        });
    }
});

// 🟢 POST: เพิ่มพื้นที่ใหม่ (Admin เท่านั้น)
router.post('/', verifyToken, checkRole(['Admin']), async (req, res) => {
    try {
        const { department, areaName, category, building, responsiblePersons, owner } = req.body;

        const newArea = new Area({
            department: department || 'วิทยาลัยรัตภูมิ',
            areaName,
            category,
            building: building || '',
            responsiblePersons: responsiblePersons || [],
            owner: (owner && mongoose.Types.ObjectId.isValid(owner)) ? owner : null
        });

        await newArea.save();
        res.status(201).json({ message: 'เพิ่มพื้นที่สำเร็จ', area: newArea });
    } catch (err) {
        res.status(400).json({ message: 'ไม่สามารถเพิ่มพื้นที่ได้', error: err.message });
    }
});

module.exports = router;
