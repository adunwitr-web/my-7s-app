const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
    area: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
    assessor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentRound: { type: String, default: 'รอบที่ 1' },
    scores: [{
        sectionNumber: { type: Number, required: true },
        score: { type: Number, required: true }
    }],
    totalScore: { type: Number, required: true },
    percentage: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Passed', 'Needs Improvement', 'Corrected', 'Approved'],
        default: 'Passed'
    },
    // รูปภาพและข้อเสนอแนะจาก "ผู้ประเมิน" (Assessor)
    evidencePhoto: { type: String, default: '' },
    assessorComment: { type: String, default: '' },

    // บันทึกและรูปภาพจาก "เจ้าของพื้นที่" (Area Owner)
    correctionData: {
        detail: { type: String, default: '' },
        photoUrl: { type: String, default: '' },
        submittedAt: { type: Date }
    },
    rejectionReason: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Assessment', assessmentSchema);