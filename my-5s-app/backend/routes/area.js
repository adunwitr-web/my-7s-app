const express = require('express');
const router = express.Router();
const Area = require('../models/Area');

// ดึงรายการพื้นที่ทั้งหมดพร้อมข้อมูล Owner
router.get('/', async (req, res) => {
    try {
        const areas = await Area.find().populate('owner', 'username firstName lastName');
        res.json(areas);
    } catch (err) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลพื้นที่', error: err.message });
    }
});

// เพิ่มพื้นที่ใหม่
router.post('/', async (req, res) => {
    try {
        const { areaName, category, owner } = req.body;
        const newArea = new Area({ areaName, category, owner });
        await newArea.save();
        res.status(201).json({ message: 'เพิ่มพื้นที่สำเร็จ', area: newArea });
    } catch (err) {
        res.status(400).json({ message: 'ไม่สามารถเพิ่มพื้นที่ได้', error: err.message });
    }
});

module.exports = router;