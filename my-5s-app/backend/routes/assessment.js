const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const Assessment = require('../models/Assessment');
const Area = require('../models/Area');
const User = require('../models/user');
const SystemConfig = require('../models/SystemConfig');

// ตรวจสอบกุญแจยืนยันตัวตน (Token)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).json({ message: 'กรุณาเข้าสู่ระบบงานสารสนเทศก่อนทำรายการ' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET || 'supersecretkey5s', (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'กุญแจยืนยันตัวตนหมดอายุหรือไม่ถูกต้อง' });
        }
        req.user = decoded;
        next();
    });
};

// 1. ลงนามและบันทึกผลการตรวจประเมิน (จัดส่งอีเมลแจ้งเตือนไปยังผู้รับผิดชอบสถานที่ทันที)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { area, assessmentRound, scores, totalScore, percentage, evidencePhoto, assessorComment } = req.body;

        if (!area || !assessmentRound) {
            return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุสถานที่และรอบการประเมิน' });
        }

        const evaluationStatus = Number(percentage) < 80 ? 'Needs Improvement' : 'Passed';

        const newAssessment = new Assessment({
            area: area,
            assessor: req.user.userId || req.user.id,
            assessmentRound: assessmentRound,
            scores: scores,
            totalScore: totalScore,
            percentage: percentage,
            status: evaluationStatus,
            evidencePhoto: evidencePhoto || '',
            assessorComment: assessorComment || ''
        });

        await newAssessment.save();

        // ค้นหาข้อมูลสถานที่และอีเมลของผู้รับผิดชอบสถานที่
        const areaInfo = await Area.findById(area).populate('owner');
        const assessorUser = await User.findById(req.user.userId || req.user.id);
        const systemSetting = await SystemConfig.findOne();

        // จัดส่งอีเมลแจ้งผลการตรวจประเมิน
        if (areaInfo && areaInfo.owner && areaInfo.owner.email) {
            try {
                const senderEmail = (systemSetting && systemSetting.adminEmail) ? systemSetting.adminEmail : 'rutsv.7s.official@gmail.com';
                const senderPass = (systemSetting && systemSetting.appPassword) ? systemSetting.appPassword : '';

                if (senderEmail && senderPass) {
                    const transporter = nodemailer.createTransport({
                        service: 'gmail',
                        auth: {
                            user: senderEmail,
                            pass: senderPass
                        }
                    });

                    const assessorFullName = assessorUser ? (assessorUser.fullName || `${assessorUser.firstName || ''} ${assessorUser.lastName || ''}`.trim()) : 'คณะกรรมการตรวจประเมินฯ';
                    const targetOwnerName = areaInfo.owner.fullName || `${areaInfo.owner.firstName || ''} ${areaInfo.owner.lastName || ''}`.trim() || 'หัวหน้างาน/ผู้รับผิดชอบสถานที่';
                    const statusTextThai = Number(percentage) >= 80 ? 'ผ่านเกณฑ์มาตรฐานการตรวจประเมิน' : 'ไม่ผ่านเกณฑ์มาตรฐาน (ต้องดำเนินการปรับปรุงแก้ไข)';
                    const statusColor = Number(percentage) >= 80 ? '#15803d' : '#b91c1c';

                    const mailOptions = {
                        from: `"ระบบประเมิน 7ส. วิทยาลัยรัตภูมิ" <${senderEmail}>`,
                        to: areaInfo.owner.email,
                        subject: `แจ้งผลการตรวจประเมินมาตรฐาน 7ส. และสิ่งแวดล้อม - ${areaInfo.areaName}`,
                        html: `
                            <div style="font-family: 'Sarabun', Tahoma, sans-serif; max-width: 650px; margin: auto; padding: 25px; border: 1px solid #cbd5e1; border-radius: 6px; background-color: #ffffff; color: #0f172a;">
                                <div style="text-align: center; border-bottom: 2px solid #1b5e20; padding-bottom: 12px; margin-bottom: 20px;">
                                    <h2 style="margin: 0; color: #1b5e20; font-size: 1.3em;">แจ้งผลการตรวจประเมินมาตรฐาน 7ส.</h2>
                                    <p style="margin: 4px 0 0 0; font-size: 0.9em; color: #475569;">มหาวิทยาลัยเทคโนโลยีราชมงคลศรีวิชัย วิทยาลัยรัตภูมิ</p>
                                </div>

                                <table style="width: 100%; font-size: 0.95em; line-height: 1.8; margin-bottom: 15px;">
                                    <tr>
                                        <td><b>วันที่ตรวจประเมิน:</b> ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                                    </tr>
                                    <tr>
                                        <td><b>เรียน:</b> ${targetOwnerName} (ผู้รับผิดชอบสถานที่)</td>
                                    </tr>
                                    <tr>
                                        <td><b>สถานที่ตรวจประเมิน:</b> ${areaInfo.areaName} (${areaInfo.category || 'ทั่วไป'})</td>
                                    </tr>
                                    <tr>
                                        <td><b>รอบการประเมิน:</b> ${assessmentRound}</td>
                                    </tr>
                                </table>

                                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid ${statusColor}; padding: 15px; border-radius: 4px; margin-bottom: 18px;">
                                    <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 1.05em; color: ${statusColor};">ผลการตรวจ: ${statusTextThai}</p>
                                    <p style="margin: 0; font-size: 0.95em;">
                                        คะแนนรวมที่ได้: <b>${totalScore} คะแนน</b> (คิดเป็นร้อยละ <b>${percentage}%</b>)
                                    </p>
                                    ${assessorComment ? `<p style="margin: 10px 0 0 0; font-size: 0.9em; color: #7c2d12; background: #fff7ed; padding: 8px 12px; border-radius: 4px;"><b>ข้อเสนอแนะจากคณะกรรมการ:</b> "${assessorComment}"</p>` : ''}
                                </div>

                                ${Number(percentage) < 80 ? `
                                <p style="font-size: 0.95em; line-height: 1.7; color: #475569;">
                                    จึงเรียนมาเพื่อโปรดดำเนินการปรับปรุงแก้ไข และจัดส่งรายงานผลการแก้ไขพร้อมภาพถ่ายเข้าสู่ระบบสารสนเทศ Green 7S Plus เพื่อให้คณะกรรมการตรวจรับรองต่อไป
                                </p>
                                ` : `
                                <p style="font-size: 0.95em; line-height: 1.7; color: #15803d;">
                                    สถานที่ของท่านผ่านเกณฑ์มาตรฐานการตรวจประเมินเรียบร้อยแล้ว ขอขอบคุณที่ให้ความร่วมมือในการรักษามาตรฐานสถานที่ปฏิบัติงาน
                                </p>
                                `}

                                <div style="text-align: center; margin-top: 25px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                                    <p style="margin: 5px 0 0 0; font-weight: bold; font-size: 0.95em;">( ${assessorFullName} )</p>
                                    <p style="margin: 2px 0 0 0; font-size: 0.85em; color: #64748b;">คณะกรรมการตรวจประเมินมาตรฐาน 7ส. และสิ่งแวดล้อม</p>
                                    <p style="margin: 2px 0 0 0; font-size: 0.8em; color: #64748b;">วิทยาลัยรัตภูมิ มหาวิทยาลัยเทคโนโลยีราชมงคลศรีวิชัย</p>
                                </div>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) console.error('❌ ไม่สามารถส่งอีเมลแจ้งเตือนได้:', error);
                        else console.log('✅ จัดส่งอีเมลแจ้งเตือนสำเร็จไปยัง:', areaInfo.owner.email);
                    });
                }
            } catch (mailErr) {
                console.error('⚠️ เกิดข้อผิดพลาดในระบบส่งอีเมล:', mailErr);
            }
        }

        res.status(201).json({ 
            success: true, 
            message: 'บันทึกผลการตรวจประเมินและจัดส่งอีเมลแจ้งเตือนเรียบร้อยแล้ว'
        });

    } catch (error) {
        console.error('❌ Error saving assessment:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 2. ดึงข้อมูลการประเมินทั้งหมด
router.get('/', verifyToken, async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .populate('area', 'areaName category')
            .populate('assessor', 'firstName lastName username fullName')
            .sort({ createdAt: -1 });

        res.json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเรียกดูข้อมูล' });
    }
});

// 3. ดึงรายการงานที่ต้องแก้ไข (สำหรับผู้รับผิดชอบสถานที่)
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId || req.user.id;
        const myAreas = await Area.find({ owner: userId });
        const myAreaIds = myAreas.map(area => area._id);

        const tasks = await Assessment.find({ 
            status: { $in: ['Needs Improvement', 'Corrected'] },
            area: { $in: myAreaIds } 
        })
        .populate('area', 'areaName category')
        .populate('assessor', 'firstName lastName fullName')
        .sort({ createdAt: -1 });

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลงาน' });
    }
});

// 4. ดึงข้อมูลประเมินแบบระบุใบตรวจ
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const assessment = await Assessment.findById(req.params.id)
            .populate('area', 'areaName category owner')
            .populate('assessor', 'firstName lastName fullName');

        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบบันทึกการประเมินนี้ในระบบ' });
        }
        res.json(assessment);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเรียกดูรายละเอียด' });
    }
});

// 5. ผู้รับผิดชอบสถานที่ส่งรายงานการปรับปรุงแก้ไข
router.patch('/:id/resolve', verifyToken, async (req, res) => {
    try {
        const { detail, photoUrl } = req.body;
        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });
        }

        assessment.status = 'Corrected';
        assessment.correctionData = {
            detail: detail || '',
            photoUrl: photoUrl || '',
            submittedAt: new Date()
        };

        await assessment.save();
        res.json({ success: true, message: 'ส่งรายงานผลการปรับปรุงสถานที่เข้าสู่ระบบสารสนเทศเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 6. รับรองผลการประเมินมาตรฐาน (Approve)
router.patch('/:id/approve', verifyToken, async (req, res) => {
    try {
        const assessment = await Assessment.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        );

        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });
        }

        res.json({ success: true, message: 'รับรองผลการประเมินมาตรฐานเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการรับรองผล' });
    }
});

// 7. ส่งกลับเพื่อปรับปรุงแก้ไขเพิ่มเติม (Reject)
router.patch('/:id/reject', verifyToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });
        }

        assessment.status = 'Needs Improvement';
        const previousDetail = assessment.correctionData ? (assessment.correctionData.detail || '') : '';
        assessment.correctionData = {
            detail: `⚠️ ข้อสั่งการส่งกลับเพื่อปรับปรุง: "${reason || 'ไม่ผ่านเกณฑ์มาตรฐาน'}"\n\n(รายละเอียดเดิม: ${previousDetail})`,
            photoUrl: assessment.correctionData ? assessment.correctionData.photoUrl : '',
            submittedAt: assessment.correctionData ? assessment.correctionData.submittedAt : null
        };

        await assessment.save();
        res.json({ success: true, message: 'ส่งเรื่องกลับให้ดำเนินการปรับปรุงแก้ไขเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการส่งกลับข้อมูล' });
    }
});

module.exports = router;