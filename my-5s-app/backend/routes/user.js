const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/user'); // อ้างอิงโมเดล User
const { verifyToken } = require('../middleware/auth'); // ระบบเช็ค Token
const Area = require('../models/Area');

// 1. ดึงรายชื่อผู้ใช้งานทั้งหมด (ไม่รวม Admin)
router.get('/', verifyToken, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' } }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
    }
});

// 2. เพิ่มผู้ใช้งานใหม่
router.post('/', verifyToken, async (req, res) => {
    try {
        const { username, password, email, firstName, lastName, role, assignedArea } = req.body; 
        
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username นี้ถูกใช้งานแล้ว' });
        }

        // 🟢 แปลงร่างรหัสผ่านให้เป็นรหัสลับก่อน!
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 🟢 ตอนบันทึก ให้เอา hashedPassword ไปใส่แทน password ปกติ
        const newUser = new User({ 
            username, 
            password: hashedPassword, // 👈 เปลี่ยนมาใช้รหัสที่เข้ารหัสแล้ว
            email, 
            firstName, 
            lastName, 
            role,
            assignedArea
        });
        await newUser.save();

        if (role === 'Area Owner' && assignedArea) {
            await Area.findByIdAndUpdate(assignedArea, { owner: newUser._id });
        }
        
        res.json({ success: true, message: 'สร้างผู้ใช้งานสำเร็จ' });
    } catch (error) {
        console.log("💥 โค้ด Error คือ:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน' });
    }
});
// 3. ลบผู้ใช้งาน
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'ลบผู้ใช้งานสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const { username, email, firstName, lastName, role, password, assignedArea } = req.body;
        
        // 1. เช็กว่า Username ใหม่ที่ส่งมา ไปซ้ำกับคนอื่นในระบบหรือไม่ (ยกเว้นตัวเอง)
        if (username) {
            const existingUser = await User.findOne({ username: username, _id: { $ne: req.params.id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Username นี้มีคนใช้แล้ว กรุณาใช้ชื่ออื่น' });
            }
        }

        // 2. รวบรวมข้อมูลที่จะอัปเดต
        let updateData = { username, email, firstName, lastName, role, assignedArea };

        // 3. เข้ารหัสรหัสผ่าน (ถ้ามีการกรอกมาใหม่)
        if (password && password.trim() !== '') {
            const bcrypt = require('bcrypt'); // เรียกใช้ bcrypt ตรงนี้เลยเผื่อลืมใส่ไว้ด้านบน
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        // 4. บันทึกลงฐานข้อมูล
        const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });
        
        if (!updatedUser) {
            return res.status(404).json({ message: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        }

        res.json({ success: true, message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
    }
});

module.exports = router;