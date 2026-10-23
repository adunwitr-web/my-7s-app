const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth');

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// รูปแบบข้อมูล user ที่ส่งกลับให้ Frontend (ใช้ร่วมกันทั้ง /login และ /me)
async function buildUserPayload(user) {
    const assignment = await User.describeAssignment(user);
    const fullName = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim();
    return {
        id: user._id,
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName,
        assignedArea: assignment.assignedArea,           // id ห้อง ("" = ไม่ล็อคห้อง)
        assignedAreaName: assignment.assignedAreaName,   // ชื่อห้อง
        assignedCategories: assignment.assignedCategories, // รายการหมวดที่รับผิดชอบ ([] = ไม่ล็อค)
        assignedCategory: assignment.assignedCategory    // หมวดแรก (ความเข้ากันได้ย้อนหลัง)
    };
}

// POST /api/auth/login  (รองรับทั้ง username และ อีเมลองค์กร ตามที่หน้า Login ระบุไว้)
router.post('/login', async (req, res) => {
    try {
        const identifier = String((req.body && req.body.username) || '').trim();
        const password = String((req.body && req.body.password) || '');

        if (!identifier || !password) {
            return res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน' });
        }

        const user = await User.findOne({
            $or: [
                { username: identifier },
                { email: new RegExp('^' + escapeRegex(identifier) + '$', 'i') }
            ]
        });

        if (!user) {
            return res.status(400).json({ message: 'ไม่พบผู้ใช้นี้ในระบบ' });
        }

        if (user.isActive === false) {
            return res.status(403).json({ message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token, user: await buildUserPayload(user) });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
    }
});

// GET /api/auth/me — ดึงสิทธิ์ล่าสุดจาก Database (แก้ปัญหาสิทธิ์ค้างใน localStorage)
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user || user.isActive === false) {
            return res.status(401).json({ message: 'ไม่พบบัญชีผู้ใช้ หรือบัญชีถูกระงับ' });
        }
        res.set('Cache-Control', 'no-store');
        res.json({ user: await buildUserPayload(user) });
    } catch (error) {
        console.error('Auth /me Error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดทางเซิร์ฟเวอร์' });
    }
});

module.exports = router; // สำคัญ: ต้องมีบรรทัดนี้
