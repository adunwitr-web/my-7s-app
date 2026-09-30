const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    adminEmail: { type: String, default: '' },
    appPassword: { type: String, default: '' }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);