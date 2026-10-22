const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Area = require('../models/Area');
const { verifyToken, checkRole } = require('../middleware/auth');

const router = express.Router();

// ทะเบียนบุคลากรจัดการได้เฉพาะ Admin
router.use(verifyToken, checkRole(['Admin']));

const isAreaOwnerRole = role => String(role || '').includes('Area Owner');

// ซิงค์ Area.owner ให้ตรงกับสิทธิ์ล่าสุดเสมอ (รองรับ role แบบผสม เช่น "Internal Assessor & Area Owner")
async function syncAreaOwnership(userId, role, assignedArea) {
    await Area.updateMany({ owner: userId }, { $unset: { owner: 1 } });
    if (isAreaOwnerRole(role) && assignedArea) {
        await Area.findByIdAndUpdate(assignedArea, { owner: userId });
    }
}

// รูปแบบข้อมูลที่หน้าเว็บอ่าน (มี assignedAreaName / assignedCategory ครบ)
async function toClient(user) {
    const obj = { ...user };
    delete obj.password;
    const a = await User.describeAssignment(obj);
    return {
        ...obj,
        assignedArea: a.assignedArea,
        assignedAreaName: a.assignedAreaName,
        assignedCategory: a.assignedCategory
    };
}

function sendError(res, error, fallback) {
    console.error(fallback, error.message);
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Username หรือ Email นี้ถูกใช้งานแล้ว' });
    }
    if (error.name === 'ValidationError') {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง: ' + error.message });
    }
    return res.status(500).json({ message: fallback });
}

// GET: รายการบุคลากร (ไม่รวม Admin)
router.get('/', async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' } }).select('-password').lean();
        const data = await Promise.all(users.map(u => toClient(u)));
        res.set('Cache-Control', 'no-store');
        res.json(data);
    } catch (error) {
        sendError(res, error, 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้');
    }
});

// POST: เพิ่มบุคลากร
router.post('/', async (req, res) => {
    try {
        const { username, password, email, firstName, lastName, role } = req.body;

        if (!username || !email || !firstName || !role) {
            return res.status(400).json({ message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน' });
        }

        const existing = await User.findOne({ $or: [{ username }, { email }] });
        if (existing) {
            return res.status(400).json({ message: 'Username หรือ Email นี้ถูกใช้งานแล้ว' });
        }

        const assign = await User.normalizeAssignment(req.body);
        const hashed = await bcrypt.hash(String(password || '123456'), 10);

        const user = new User({
            username,
            password: hashed,
            email,
            firstName,
            lastName: lastName || '',
            fullName: `${firstName} ${lastName || ''}`.trim(),
            role,
            assignedArea: assign.assignedArea,
            assignedCategory: assign.assignedCategory
        });
        await user.save();
        await syncAreaOwnership(user._id, user.role, user.assignedArea);

        res.json({ success: true, message: 'สร้างผู้ใช้งานสำเร็จ' });
    } catch (error) {
        sendError(res, error, 'เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน');
    }
});

// PATCH: แก้ไขบุคลากร (ส่งเฉพาะฟิลด์ที่ต้องการแก้ก็ได้)
router.patch('/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        const b = req.body || {};

        if (b.username && b.username !== user.username) {
            const dup = await User.findOne({ username: b.username, _id: { $ne: user._id } });
            if (dup) {
                return res.status(400).json({ message: 'Username นี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น' });
            }
            user.username = b.username;
        }
        if (b.email) user.email = b.email;
        if (b.firstName !== undefined) user.firstName = b.firstName;
        if (b.lastName !== undefined) user.lastName = b.lastName;
        user.fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        if (b.role) user.role = b.role;

        if (b.password && String(b.password).trim() !== '') {
            user.password = await bcrypt.hash(String(b.password).trim(), 10);
        }

        if (b.assignedArea !== undefined || b.assignedCategory !== undefined) {
            const assign = await User.normalizeAssignment({
                assignedArea: b.assignedArea !== undefined ? b.assignedArea : user.assignedArea,
                assignedCategory: b.assignedCategory !== undefined ? b.assignedCategory : user.assignedCategory
            });
            user.assignedArea = assign.assignedArea;
            user.assignedCategory = assign.assignedCategory;
        }

        await user.save();
        await syncAreaOwnership(user._id, user.role, user.assignedArea);

        res.json({ success: true, message: 'อัปเดตข้อมูลและรหัสผ่านสำเร็จ' });
    } catch (error) {
        sendError(res, error, 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
    }
});

// DELETE: ลบบุคลากร
router.delete('/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }
        await Area.updateMany({ owner: req.params.id }, { $unset: { owner: 1 } });
        await Area.updateMany({ assignedUsers: req.params.id }, { $pull: { assignedUsers: req.params.id } });
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
    } catch (error) {
        sendError(res, error, 'เกิดข้อผิดพลาดในการลบข้อมูล');
    }
});

module.exports = router;
