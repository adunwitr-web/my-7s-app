const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const Assessment = require('../models/Assessment');
const Area = require('../models/Area');
const SystemConfig = require('../models/SystemConfig');

// Middleware ตรวจสอบ Token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: 'กรุณาล็อกอินก่อนทำรายการ' });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'กุญแจหมดอายุหรือไม่ถูกต้อง' });
        }
        req.user = decoded; // ได้ { userId, role }
        next();
    });
};

// ทดสอบ Route
router.get('/test', (req, res) => {
    res.json({ message: 'Assessment Route is working perfectly!' });
});

// 🟢 1. บันทึกผลการประเมิน Green 7S Plus
router.post('/', verifyToken, async (req, res) => {
    try {
        const { area, assessmentRound, scores, totalScore, percentage } = req.body;

        if (!area || !assessmentRound) {
            return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน กรุณาเลือกพื้นที่และรอบการประเมิน' });
        }

        // ตัดเกรดสถานะ: เกณฑ์ Green 7S Plus คือ ต่ำกว่า 80% ต้องปรับปรุง (Needs Improvement)
        const evaluationStatus = Number(percentage) < 80 ? 'Needs Improvement' : 'Passed';

        const newAssessment = new Assessment({
            area: area,
            assessor: req.user.userId || req.user.id, 
            assessmentRound: assessmentRound,
            scores: scores,
            totalScore: totalScore,
            percentage: percentage,
            status: evaluationStatus
        });

        await newAssessment.save();

        // ส่งอีเมลแจ้งเตือนอัตโนมัติหาเจ้าของพื้นที่ เมื่อคะแนนต่ำกว่า 80%
        if (Number(percentage) < 80) {
            try {
                const areaInfo = await Area.findById(area).populate('owner');
                const systemSetting = await SystemConfig.findOne();

                if (areaInfo && areaInfo.owner && areaInfo.owner.email && systemSetting && systemSetting.adminEmail && systemSetting.appPassword) {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: systemSetting.adminEmail,
                            pass: systemSetting.appPassword
                        }
                    });

                    const mailOptions = {
                        from: systemSetting.adminEmail,
                        to: areaInfo.owner.email,
                        subject: '⚠️ แจ้งเตือน: พื้นที่ของคุณต้องได้รับการปรับปรุง (Green 7S Plus)',
                        html: `
                            <div style="font-family: 'Sarabun', sans-serif, Tahoma; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                                <h3 style="color: #D32F2F; margin-top: 0;">แจ้งเตือนผลการประเมิน Green 7S Plus</h3>
                                <p>พื้นที่รับผิดชอบ: <b>${areaInfo.areaName} (${areaInfo.category || 'ทั่วไป'})</b></p>
                                <p>รอบการประเมิน: <b>${assessmentRound}</b></p>
                                <p>คะแนนรวมที่ได้: <b>${totalScore} คะแนน</b></p>
                                <p>คิดเป็น: <b><span style="color:#D32F2F; font-size: 1.25em;">${percentage}%</span></b> (ต่ำกว่าเกณฑ์ร้อยละ 80)</p>
                                <p>กรุณาเข้าสู่ระบบเพื่อตรวจสอบรายการที่ต้องปรับปรุงและส่งหลักฐานการแก้ไข</p>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) console.error('❌ ส่งอีเมลแจ้งเตือนล้มเหลว:', error);
                        else console.log('✅ ส่งอีเมลแจ้งเตือนสำเร็จไปยัง:', areaInfo.owner.email);
                    });
                }
            } catch (mailErr) {
                console.error('⚠️ เกิดข้อผิดพลาดขณะเตรียมส่งอีเมล:', mailErr);
            }
        }

        res.status(201).json({ success: true, message: 'บันทึกผลการประเมินเรียบร้อยแล้ว' });

    } catch (error) {
        console.error('❌ Error saving assessment:', error); 
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 🟢 2. ดึงข้อมูลการประเมินทั้งหมด (สำหรับ Admin Dashboard)
router.get('/', verifyToken, async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .populate('area', 'areaName category')
            .populate('assessor', 'firstName lastName username')
            .sort({ createdAt: -1 });

        res.json(assessments);
    } catch (error) {
        console.error('Error fetching all assessments:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// 🟢 3. ดึงรายการงานที่ต้องแก้ไข (สำหรับ Owner Dashboard)
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        
        // ค้นหาห้องที่ผู้ใช้นี้เป็น Owner
        const myAreas = await Area.find({ owner: userId });
        const myAreaIds = myAreas.map(area => area._id);

        // ดึงใบประเมินของห้องตัวเองที่สถานะเป็น Needs Improvement หรือ Corrected
        const tasks = await Assessment.find({ 
            status: { $in: ['Needs Improvement', 'Corrected'] },
            area: { $in: myAreaIds } 
        })
        .populate('area', 'areaName category')
        .populate('assessor', 'firstName lastName')
        .sort({ createdAt: -1 });

        res.json(tasks);
    } catch (error) {
        console.error('Error fetching pending tasks:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// 🟢 4. ดึงข้อมูลการประเมินแบบเจาะจง 1 รายการ (สำหรับเปิด Modal ดูคะแนนรายข้อ)
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const assessment = await Assessment.findById(req.params.id)
            .populate('area', 'areaName category owner')
            .populate('assessor', 'firstName lastName');
        
        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการประเมิน' });
        }
        res.json(assessment);
    } catch (error) {
        console.error('Error fetching assessment by ID:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายละเอียด' });
    }
});

// 🟢 5. เจ้าของพื้นที่ส่งรายงานการแก้ไข (Resolve Task)
router.patch('/:id/resolve', verifyToken, async (req, res) => {
    try {
        const { detail, photoUrl } = req.body;
        const assessment = await Assessment.findById(req.params.id);
        
        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการประเมินนี้' });
        }

        assessment.status = 'Corrected';
        assessment.correctionData = {
            detail: detail || '',
            photoUrl: photoUrl || '',
            submittedAt: new Date() 
        };

        await assessment.save();
        res.json({ success: true, message: 'ส่งรายงานการแก้ไขเรียบร้อยแล้ว' });

    } catch (error) {
        console.error('Error resolving assessment:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 🟢 6. Admin กดอนุมัติผลงานแก้ไข (Approve)
router.patch('/:id/approve', verifyToken, async (req, res) => {
    try {
        const assessment = await Assessment.findByIdAndUpdate(
            req.params.id, 
            { status: 'Approved' },
            { new: true }
        );
        
        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการประเมิน' });
        }

        res.json({ success: true, message: 'อนุมัติการแก้ไขเรียบร้อยแล้ว' });
    } catch (error) {
        console.error('Error approving assessment:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอนุมัติข้อมูล' });
    }
});

// 🟢 7. Admin กดตีกลับให้แก้ไขใหม่ (Reject)
router.patch('/:id/reject', verifyToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const assessment = await Assessment.findById(req.params.id);
        
        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลการประเมิน' });
        }

        assessment.status = 'Needs Improvement';
        
        const previousDetail = assessment.correctionData ? (assessment.correctionData.detail || '') : '';
        assessment.correctionData = {
            detail: `⚠️ ผู้ดูแลระบบส่งกลับให้แก้ไขใหม่: "${reason || 'ไม่ผ่านเกณฑ์'}"\n\n(รายละเอียดเดิม: ${previousDetail})`,
            photoUrl: assessment.correctionData ? assessment.correctionData.photoUrl : '',
            submittedAt: assessment.correctionData ? assessment.correctionData.submittedAt : null
        };
        
        await assessment.save();
        res.json({ success: true, message: 'ตีกลับให้แก้ไขเรียบร้อยแล้ว' });

    } catch (error) {
        console.error('Error rejecting assessment:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตีกลับข้อมูล' });
    }
});

module.exports = router;