const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    adminEmail: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    activeRound: { type: String, default: '' },
    roundStartDate: { type: Date },
    roundEndDate: { type: Date },

    // ผลการส่งอีเมลล่าสุด (ใช้ตรวจสอบระบบแจ้งเตือน)
    lastMailOk: { type: Boolean, default: null },
    lastMailAt: { type: Date },
    lastMailTo: { type: String, default: '' },
    lastMailError: { type: String, default: '' }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
