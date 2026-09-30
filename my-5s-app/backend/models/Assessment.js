const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
    area: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Area', 
        required: true 
    },
    assessor: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    
    // รอบการประเมิน (เช่น ประเมินตนเอง ครั้งที่ 1, ประเมินโดยมหาวิทยาลัย)
    assessmentRound: { 
        type: String, 
        required: true 
    },
    
    // รายละเอียดคะแนนแต่ละข้อ (รองรับทั้ง 10 ข้อ และ 12 ข้อ, ข้อละ 0-4 คะแนน)
    scores: [{
        sectionNumber: { type: Number, required: true },
        score: { type: Number, min: 0, max: 4, required: true }
    }],
    
    // คะแนนรวมที่ได้
    totalScore: { 
        type: Number, 
        default: 0 
    },
    
    // คิดเป็นร้อยละ (%)
    percentage: { 
        type: Number, 
        default: 0 
    },
    
    // สถานะใบประเมิน: 
    // - Passed: ผ่านเกณฑ์ (ร้อยละ 80 ขึ้นไป)
    // - Needs Improvement: ควรปรับปรุง/ต้องปรับปรุงเร่งด่วน (ต่ำกว่าร้อยละ 80)
    // - Corrected: เจ้าของพื้นที่ส่งหลักฐานแก้ไขแล้ว รอตรวจ
    // - Approved: ตรวจผ่านการแก้ไขเรียบร้อย
    status: { 
        type: String, 
        enum: ['Passed', 'Needs Improvement', 'Corrected', 'Approved'], 
        default: 'Passed' 
    },
    
    // ข้อมูลการส่งรายงานแก้ไข (สำหรับ Area Owner)
    correctionData: {
        detail: { type: String, default: '' },      // รายละเอียดคำอธิบายการแก้ไข
        photoUrl: { type: String, default: '' },    // ลิงก์หรือชื่อไฟล์รูปภาพหลังปรับปรุง
        submittedAt: { type: Date }                 // วันเวลาที่ส่งงานแก้ไข
    }

}, { timestamps: true });

module.exports = mongoose.models.Assessment || mongoose.model('Assessment', assessmentSchema);