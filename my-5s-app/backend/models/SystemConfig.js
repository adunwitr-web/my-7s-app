const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    adminEmail: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    activeRound: { type: String, default: '' },
    academicYear: { type: String, default: '' },   // ✅ เพิ่ม: หน้า Admin ส่งมา / หน้าผู้ประเมินแสดงผล แต่เดิมไม่มีใน Schema จึงไม่เคยถูกบันทึก
    roundStartDate: { type: Date },
    roundEndDate: { type: Date }
});

module.exports = mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);
