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

module.exports = router;