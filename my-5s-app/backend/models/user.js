const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/user');
const { verifyToken } = require('../middleware/auth');
const Area = require('../models/Area');

router.get('/', verifyToken, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' } })
            .select('-password')
            .populate('assignedArea')
            .catch(async () => {
                return await User.find({ role: { $ne: 'Admin' } }).select('-password');
            });
        res.json(users);
    } catch (error) {
        console.error('Error GET /user:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้', error: error.message });
    }
});

router.post('/', verifyToken, async (req, res) => {
    try {
        const { username, password, email, firstName, lastName, role, assignedArea } = req.body;

        const existingUser = await User.findOne({ $or: [{ username: username }, { email: email }] });
        if (existingUser) {
            return res.status(400).json({ message: 'Username หรือ Email นี้ถูกใช้งานแล้ว' });
        }

        const validArea = (assignedArea && mongoose.Types.ObjectId.isValid(assignedArea)) ? assignedArea : null;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || '123456', salt);

        const fName = firstName || '';
        const lName = lastName || '';
        const fullNameStr = (fName + ' ' + lName).trim();

        const newUser = new User({
            username: username,
            password: hashedPassword,
            email: email,
            firstName: firstName,
            lastName: lastName,
            fullName: fullNameStr,
            role: role,
            assignedArea: validArea
        });
        await newUser.save();

        if (role === 'Area Owner' && validArea) {
            await Area.findByIdAndUpdate(validArea, { owner: newUser._id });
        }

        res.json({ success: true, message: 'สร้างผู้ใช้งานสำเร็จ' });
    } catch (error) {
        console.error('Error POST /user:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาด: ' + error.message });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        await Area.updateMany({ owner: req.params.id }, { $unset: { owner: 1 } });
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const { username, email, firstName, lastName, role, password, assignedArea } = req.body;

        if (username) {
            const existingUser = await User.findOne({ username: username, _id: { $ne: req.params.id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Username นี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น' });
            }
        }

        const validArea = (assignedArea && mongoose.Types.ObjectId.isValid(assignedArea)) ? assignedArea : null;

        let updateData = {};
        if (username) updateData.username = username;
        if (email) updateData.email = email;
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (firstName || lastName) {
            const fName = firstName || '';
            const lName = lastName || '';
            updateData.fullName = (fName + ' ' + lName).trim();
        }
        if (role) updateData.role = role;
        if (assignedArea !== undefined) updateData.assignedArea = validArea;

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await User.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        if (updatedUser.role === 'Area Owner' && validArea) {
            await Area.updateMany({ owner: updatedUser._id, _id: { $ne: validArea } }, { $unset: { owner: 1 } });
            await Area.findByIdAndUpdate(validArea, { owner: updatedUser._id });
        }

        res.json({ success: true, message: 'อัปเดตข้อมูลและรหัสผ่านสำเร็จ' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ' + error.message });
    }
});

module.exports = router;