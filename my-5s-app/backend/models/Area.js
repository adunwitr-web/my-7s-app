const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    areaName: { type: String, required: true }, // เช่น "ห้องปฏิบัติการทดลอง G02"
    category: { 
        type: String, 
        enum: [
            'สำนักงาน และห้องพักอาจารย์',
            'ห้องเรียน',
            'ห้องปฏิบัติการคอมพิวเตอร์',
            'ห้องปฏิบัติการทดลอง',
            'โรงฝึกงาน',
            'ห้องปฏิบัติการวิชาชีพ',
            'ห้องสมุด',
            'อาคารสถานที่และความปลอดภัยอาคาร',
            'ภูมิทัศน์และพื้นที่ส่วนกลาง',
            'โรงอาหารและซุ้มอาหาร',
            'ห้องประชุมและหอประชุม'
        ],
        required: true 
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // ดึง Area Owner มาแสดงอัตโนมัติ
}, { timestamps: true });

module.exports = mongoose.models.Area || mongoose.model('Area', areaSchema);