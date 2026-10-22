const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema({
    adminEmail: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    activeRound: { type: String, default: '' },     
    roundStartDate: { type: Date },                 
    roundEndDate: { type: Date }
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);