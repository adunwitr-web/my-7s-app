const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const Area = require('../models/Area');
const { verifyToken, checkRole } = require('../middleware/auth');

// ทุก endpoint จัดการผู้ใช้ ต้องเป็น Admin เท่านั้น
const adminOnly = [verifyToken, checkRole(['Admin'])];

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function handleError(res, error, fallbackMsg) {
    if (error && error.code === 11000) {
        return res.status(400).json({ message: 'Username หรือ Email นี้ถูกใช้งานแล้ว' });
    }
    if (error && error.name === 'ValidationError') {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง: ' + error.message });
    }
    console.error(fallbackMsg, error);
    return res.status(500).json({ message: fallbackMsg + ': ' + (error.message || '') });
}

// GET /api/user  — รายชื่อผู้ใช้ (ไม่รวม Admin)
router.get('/', adminOnly, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' } })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        // แปลง assignedArea ให้เป็นชื่อหมวดหมู่ (String) เสมอ รวมถึงข้อมูลเก่าที่เป็น ObjectId
        const result = await Promise.all(users.map(async (u) => ({
            ...u,
            assignedArea: await User.resolveAssignedCategory(u.assignedArea)
        })));

        res.set('Cache-Control', 'no-store');
        res.json(result);
    } catch (error) {
        console.error('Error GET /user:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้', error: error.message });
    }
});

// POST /api/user  — สร้างผู้ใช้
router.post('/', adminOnly, async (req, res) => {
    try {
        const b = req.body || {};
        const username = String(b.username || '').trim();
        const email = String(b.email || '').trim();
        const firstName = String(b.firstName || '').trim();
        const lastName = String(b.lastName || '').trim();

        if (!username || !email || !firstName || !b.role) {
            return res.status(400).json({ message: 'กรุณากรอก Username, Email, ชื่อจริง และสิทธิ์หน้าที่ให้ครบถ้วน' });
        }

        const existingUser = await User.findOne({
            $or: [
                { username },
                { email: new RegExp('^' + escapeRegex(email) + '$', 'i') }
            ]
        });
        if (existingUser) {
            return res.status(400).json({ message: 'Username หรือ Email นี้ถูกใช้งานแล้ว' });
        }

        // "" / null = ไม่ล็อค, ค่าอื่น = ชื่อหมวดหมู่
        const assignedArea = await User.resolveAssignedCategory(b.assignedArea);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(String(b.password || '').trim() || '123456', salt);

        const newUser = new User({
            username,
            password: hashedPassword,
            email,
            firstName,
            lastName,
            fullName: (firstName + ' ' + lastName).trim(),
            role: b.role,
            assignedArea
        });
        await newUser.save();

        res.json({ success: true, message: 'สร้างผู้ใช้งานสำเร็จ' });
    } catch (error) {
        handleError(res, error, 'เกิดข้อผิดพลาดในการสร้างผู้ใช้');
    }
});

// PATCH /api/user/:id  — แก้ไขผู้ใช้
router.patch('/:id', adminOnly, async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        const current = await User.findById(id);
        if (!current) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        const b = req.body || {};
        const update = {};

        const username = typeof b.username === 'string' ? b.username.trim() : '';
        if (username) {
            const dup = await User.findOne({ username, _id: { $ne: id } });
            if (dup) {
                return res.status(400).json({ message: 'Username นี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น' });
            }
            update.username = username;
        }

        const email = typeof b.email === 'string' ? b.email.trim() : '';
        if (email) {
            const dup = await User.findOne({ email: new RegExp('^' + escapeRegex(email) + '$', 'i'), _id: { $ne: id } });
            if (dup) {
                return res.status(400).json({ message: 'Email นี้มีคนใช้แล้ว กรุณาใช้อีเมลอื่น' });
            }
            update.email = email;
        }

        const firstName = typeof b.firstName === 'string' ? b.firstName.trim() : '';
        if (firstName) update.firstName = firstName;

        // นามสกุลอนุญาตให้ล้างเป็นค่าว่างได้
        if (has(b, 'lastName')) update.lastName = String(b.lastName || '').trim();

        if (b.role) update.role = b.role;

        // ✅ จุดสำคัญ: เช็คว่า "มี key ส่งมาไหม" (ไม่ใช่เช็ค truthy) เพื่อให้ "" = ปลดล็อคได้จริง
        if (has(b, 'assignedArea')) {
            update.assignedArea = await User.resolveAssignedCategory(b.assignedArea);
        }

        if (has(update, 'firstName') || has(update, 'lastName')) {
            const f = has(update, 'firstName') ? update.firstName : (current.firstName || '');
            const l = has(update, 'lastName') ? update.lastName : (current.lastName || '');
            update.fullName = (f + ' ' + l).trim();
        }

        if (typeof b.password === 'string' && b.password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            update.password = await bcrypt.hash(b.password.trim(), salt);
        }

        const updated = await User.findByIdAndUpdate(
            id,
            { $set: update },
            { new: true, runValidators: true }
        ).select('-password').lean();

        if (!updated) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        updated.assignedArea = await User.resolveAssignedCategory(updated.assignedArea);
        res.json({ success: true, message: 'อัปเดตข้อมูลและรหัสผ่านสำเร็จ', user: updated });
    } catch (error) {
        handleError(res, error, 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล');
    }
});

// DELETE /api/user/:id
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }
        if (String(id) === String(req.user.userId)) {
            return res.status(400).json({ message: 'ไม่สามารถลบบัญชีของตนเองได้' });
        }

        await User.findByIdAndDelete(id);
        await Area.updateMany({ owner: id }, { $unset: { owner: 1 } });
        await Area.updateMany({ assignedUsers: id }, { $pull: { assignedUsers: id } });
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

module.exports = router;
