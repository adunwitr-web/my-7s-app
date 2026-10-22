const mongoose = require('mongoose');

const formTemplateSchema = new mongoose.Schema({
    formName: { type: String, required: true }, // ชื่อฟอร์ม เช่น "แบบประเมินห้องเรียน", "แบบประเมินห้องสำนักงาน"
    targetAreas: [String], // รายชื่อประเภทสถานที่ที่ใช้ฟอร์มนี้ (เช่น ["ห้องเรียน", "ห้องปฏิบัติการ"])
    categories: [{
        num: String,    
        title: String,  
        items: [String] 
    }],
    isActive: { type: Boolean, default: true }, // เปิด-ปิด การใช้งานฟอร์ม
    publishMode: { type: String, enum: ['immediate', 'scheduled', 'draft'], default: 'immediate' },
    publishDate: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('FormTemplate', formTemplateSchema);