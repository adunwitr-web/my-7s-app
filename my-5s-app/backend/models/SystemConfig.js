const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    adminEmail: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    activeRound: { type: String, default: '' },
    roundStartDate: { type: Date },
    roundEndDate: { type: Date },

    // ค่าการส่งอีเมลที่แอดมินตั้งจากหน้าเว็บ
    mailProvider: { type: String, default: '' },          // 'mailjet' | 'smtp' | ''
    mailFrom: { type: String, default: '' },              // อีเมลผู้ส่งที่ยืนยันแล้วใน Mailjet
    mailjetApiKey: { type: String, default: '' },
    mailjetSecretKey: { type: String, default: '' },

    // ผลการส่งอีเมลล่าสุด
    lastMailOk: { type: Boolean, default: null },
    lastMailAt: { type: Date },
    lastMailTo: { type: String, default: '' },
    lastMailError: { type: String, default: '' },
    lastMailMessageId: { type: String, default: '' }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
