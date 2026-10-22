const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminOnly = checkRole(['Admin']);

function toDateOrNull(v) {
    if (v === undefined) return undefined;   // ไม่ส่งมา = ไม่แก้ไข
    if (v === null || v === '') return null; // ส่งค่าว่างมา = ล้างค่า
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

// GET /api/system-config — ตั้งค่าอีเมลผู้ดูแล (Admin) ไม่ส่งรหัสผ่านแอปกลับไปให้ Browser
router.get('/', verifyToken, adminOnly, async (req, res) => {
    try {
        let config = await SystemConfig.findOne();
        if (!config) config = await SystemConfig.create({ adminEmail: '', appPassword: '' });
        res.json({
            adminEmail: config.adminEmail || '',
            hasAppPassword: !!config.appPassword,
            activeRound: config.activeRound || '',
            academicYear: config.academicYear || '',
            roundStartDate: config.roundStartDate || null,
            roundEndDate: config.roundEndDate || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching config' });
    }
});

// POST /api/system-config (Admin)
router.post('/', verifyToken, adminOnly, async (req, res) => {
    try {
        const { adminEmail, appPassword } = req.body;
        let config = await SystemConfig.findOne();

        if (!config) {
            config = new SystemConfig({ adminEmail: adminEmail || '', appPassword: appPassword || '' });
        } else {
            if (adminEmail !== undefined) config.adminEmail = adminEmail;
            if (appPassword && String(appPassword).trim() !== '') config.appPassword = String(appPassword).trim();
        }

        await config.save();
        res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating config' });
    }
});

// GET /api/system-config/round — ผู้ใช้ทุกคนที่ Login ดูรอบประเมินได้
router.get('/round', verifyToken, async (req, res) => {
    try {
        const config = await SystemConfig.findOne();
        res.set('Cache-Control', 'no-store');
        if (!config) {
            return res.json({ activeRound: '', academicYear: '', roundStartDate: null, roundEndDate: null });
        }
        res.json({
            activeRound: config.activeRound || '',
            academicYear: config.academicYear || '',
            roundStartDate: config.roundStartDate || null,
            roundEndDate: config.roundEndDate || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching round config' });
    }
});

// POST /api/system-config/round (Admin) — บันทึกเฉพาะฟิลด์ที่ส่งมา
router.post('/round', verifyToken, adminOnly, async (req, res) => {
    try {
        const { activeRound, academicYear, roundStartDate, roundEndDate } = req.body;
        let config = await SystemConfig.findOne();
        if (!config) config = new SystemConfig({ adminEmail: '', appPassword: '' });

        if (activeRound !== undefined) config.activeRound = String(activeRound || '').trim();
        if (academicYear !== undefined) config.academicYear = String(academicYear || '').trim();

        const start = toDateOrNull(roundStartDate);
        const end = toDateOrNull(roundEndDate);
        if (start !== undefined) config.roundStartDate = start;
        if (end !== undefined) config.roundEndDate = end;

        await config.save();
        res.json({ success: true, message: 'บันทึกรอบการประเมินและระยะเวลาสำเร็จ' });
    } catch (error) {
        console.error('Error updating round config:', error);
        res.status(500).json({ message: 'เซิร์ฟเวอร์เกิดข้อผิดพลาดในการบันทึกรอบประเมิน' });
    }
});

module.exports = router;
