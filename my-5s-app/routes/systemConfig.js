const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');


router.get('/', async (req, res) => {
    try {
        let config = await SystemConfig.findOne();
        if (!config) config = await SystemConfig.create({ adminEmail: '', appPassword: '' });
        res.json(config);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching config' });
    }
});


router.post('/', async (req, res) => {
    try {
        const { adminEmail, appPassword } = req.body;
        let config = await SystemConfig.findOne();
        
        if (!config) {
            config = new SystemConfig({ adminEmail, appPassword });
        } else {
            config.adminEmail = adminEmail;
            if (appPassword && appPassword.trim() !== '') config.appPassword = appPassword; 
        }
        
        await config.save();
        res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating config' });
    }
});


router.get('/round', async (req, res) => {
    try {
        const config = await SystemConfig.findOne();
        if (!config) {
            return res.json({ activeRound: '', roundStartDate: null, roundEndDate: null });
        }
        res.json({
            activeRound: config.activeRound || '',
            roundStartDate: config.roundStartDate || null,
            roundEndDate: config.roundEndDate || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching round config' });
    }
});


router.post('/round', async (req, res) => {
    try {
        const { activeRound, roundStartDate, roundEndDate } = req.body;
        let config = await SystemConfig.findOne();
        
        if (!config) {
            config = new SystemConfig({ 
                adminEmail: '', 
                appPassword: '',
                activeRound, 
                roundStartDate, 
                roundEndDate 
            });
        } else {
            config.activeRound = activeRound;
            config.roundStartDate = roundStartDate;
            config.roundEndDate = roundEndDate;
        }
        
        await config.save();
        res.json({ success: true, message: 'บันทึกรอบการประเมินและระยะเวลาสำเร็จ' });
    } catch (error) {
        console.error('Error updating round config:', error);
        res.status(500).json({ message: 'เซิร์ฟเวอร์เกิดข้อผิดพลาดในการบันทึกรอบประเมิน' });
    }
});



module.exports = router;