const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
    assetName: { type: String, required: true },
    assetCode: { type: String, required: true }, // เลขครุภัณฑ์
    condition: { type: String, enum: ['ปกติ', 'ชำรุด'], default: 'ปกติ' },
    placement: { type: String, enum: ['เหมาะสม', 'ไม่เหมาะสม'], default: 'เหมาะสม' },
    cleanliness: { type: String, enum: ['ผ่าน', 'ไม่ผ่าน'], default: 'ผ่าน' },
    registryMatch: { type: String, enum: ['ตรงตามทะเบียน', 'ไม่ตรงตามทะเบียน'], default: 'ตรงตามทะเบียน' }
});

module.exports = mongoose.model('Asset', assetSchema);