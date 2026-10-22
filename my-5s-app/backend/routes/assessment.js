const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Assessment = require('../models/Assessment');
const Area = require('../models/Area');
const User = require('../models/user');
const { verifyToken, checkRole } = require('../middleware/auth');

const adminOnly = checkRole(['Admin']);

function escapeRegex(text) {
    return text ? String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

// เทียบชื่อหมวดหมู่แบบยืดหยุ่น (กันชื่อจาก Excel กับชื่อในฟอร์มต่างกันเล็กน้อย)
function categoryMatches(a, b) {
    const x = String(a || '').trim().toLowerCase();
    const y = String(b || '').trim().toLowerCase();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
}

// 1. บันทึกผลการตรวจประเมิน (พร้อมป้องกันการส่งซ้ำในรอบเดียวกัน)
router.post('/', verifyToken, async (req, res) => {
    try {
        let { area, category, assessmentRound, scores, items, totalScore, percentage, evidencePhoto, assessorComment } = req.body;

        if (!area || !assessmentRound) {
            return res.status(400).json({ message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุสถานที่และรอบการประเมิน' });
        }

        // 🟢 1. ค้นหา Area ใน DB ให้ถูกต้อง
        let foundArea = null;
        if (mongoose.Types.ObjectId.isValid(area)) {
            foundArea = await Area.findById(area);
        }

        if (!foundArea) {
            const cleanName = String(area).replace(/^\d+\.\s*/, '').trim();
            foundArea = await Area.findOne({
                $or: [
                    { areaName: area },
                    { areaName: cleanName },
                    { areaName: new RegExp(escapeRegex(cleanName), 'i') }
                ]
            });
        }

        // 🔒 2. ตรวจสิทธิ์ล็อคพื้นที่ฝั่งเซิร์ฟเวอร์ (กันการข้ามสิทธิ์ที่ Admin ตั้งไว้)
        const me = await User.findById(req.user.userId).select('role assignedArea assignedCategory').lean();
        if (me && me.role !== 'Admin') {
            const lock = await User.describeAssignment(me);
            if (lock.assignedArea) {
                if (!foundArea || String(foundArea._id) !== lock.assignedArea) {
                    return res.status(403).json({ message: 'คุณมีสิทธิ์ประเมินเฉพาะพื้นที่ที่ได้รับมอบหมายเท่านั้น' });
                }
            } else if (lock.assignedCategory) {
                const ok = categoryMatches(category, lock.assignedCategory) ||
                    (foundArea && categoryMatches(foundArea.category, lock.assignedCategory));
                if (!ok) {
                    return res.status(403).json({ message: `คุณมีสิทธิ์ประเมินเฉพาะหมวดหมู่ "${lock.assignedCategory}" เท่านั้น` });
                }
            }
        }

        if (foundArea) {
            area = foundArea._id;
        } else {
            // สร้าง Area ใหม่ถ้ายังไม่มีในระบบ (ต้องมี department ตาม Schema)
            const newArea = new Area({
                department: 'วิทยาลัยรัตภูมิ',
                areaName: String(area).replace(/^\d+\.\s*/, '').trim(),
                category: category || 'สำนักงาน'
            });
            const savedArea = await newArea.save();
            area = savedArea._id;
        }

        // 🟢 3. ป้องกันการส่งแบบประเมินซ้ำ (พื้นที่เดียวกัน + รอบเดียวกัน + ผู้ประเมินคนเดียวกัน)
        const existingCheck = await Assessment.findOne({
            area: area,
            assessmentRound: assessmentRound,
            assessor: req.user.userId
        });

        if (existingCheck) {
            return res.status(400).json({
                message: `สถานที่นี้ได้รับการตรวจประเมินในรอบ "${assessmentRound}" เรียบร้อยแล้ว ไม่สามารถส่งแบบประเมินซ้ำได้`
            });
        }

        const evaluationStatus = Number(percentage) < 80 ? 'Needs Improvement' : 'Passed';

        const newAssessment = new Assessment({
            area: area,
            assessor: req.user.userId,
            assessmentRound: assessmentRound,
            scores: scores || [],
            items: items || [],
            totalScore: totalScore,
            percentage: percentage,
            status: evaluationStatus,
            evidencePhoto: evidencePhoto || '',
            assessorComment: assessorComment || ''
        });

        await newAssessment.save();

        res.status(201).json({
            success: true,
            message: 'บันทึกผลการตรวจประเมินเรียบร้อยแล้ว'
        });

    } catch (error) {
        console.error('❌ Error saving assessment:', error);
        res.status(500).json({ message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 2. ดึงข้อมูลการประเมินทั้งหมดสำหรับ Admin
router.get('/', verifyToken, adminOnly, async (req, res) => {
    try {
        const assessments = await Assessment.find()
            .populate('area', 'areaName category owner')
            .populate('assessor', 'firstName lastName username fullName')
            .sort({ createdAt: -1 });

        res.json(assessments);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเรียกดูข้อมูล' });
    }
});

// 3. ดึงรายการประเมินสำหรับ Owner Dashboard
router.get('/pending', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const currentUser = await User.findById(userId).select('assignedArea assignedCategory').lean();

        const idSet = new Set();

        // ห้องที่ผู้ใช้เป็นเจ้าของ (Area.owner)
        const ownedAreas = await Area.find({ owner: userId }).select('_id');
        ownedAreas.forEach(a => idSet.add(String(a._id)));

        // ห้อง/หมวดหมู่ที่ Admin มอบหมายไว้ในทะเบียนบุคลากร
        if (currentUser) {
            const lock = await User.describeAssignment(currentUser);
            if (lock.assignedArea) {
                idSet.add(lock.assignedArea);
            } else if (lock.assignedCategory) {
                const catAreas = await Area.find({
                    category: new RegExp(escapeRegex(lock.assignedCategory), 'i')
                }).select('_id');
                catAreas.forEach(a => idSet.add(String(a._id)));
            }
        }

        if (idSet.size === 0) return res.json([]);

        const myAreaIds = [...idSet].map(id => new mongoose.Types.ObjectId(id));

        const tasks = await Assessment.find({ area: { $in: myAreaIds } })
            .populate('area', 'areaName category owner')
            .populate('assessor', 'firstName lastName fullName username')
            .sort({ createdAt: -1 });

        res.json(tasks);
    } catch (error) {
        console.error('Error fetching pending tasks:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลงาน' });
    }
});

// 4. ดึงข้อมูลแบบระบุ ID
router.get('/:id', verifyToken, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'ไม่พบบันทึกการประเมินนี้ในระบบ' });
        }
        const assessment = await Assessment.findById(req.params.id)
            .populate('area', 'areaName category owner')
            .populate('assessor', 'firstName lastName fullName username');

        if (!assessment) {
            return res.status(404).json({ message: 'ไม่พบบันทึกการประเมินนี้ในระบบ' });
        }
        res.json(assessment);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเรียกดูรายละเอียด' });
    }
});

// 5. เจ้าของสถานที่ส่งรายงานการแก้ไข
router.patch('/:id/resolve', verifyToken, async (req, res) => {
    try {
        const role = String(req.user.role || '');
        if (role !== 'Admin' && !role.includes('Area Owner')) {
            return res.status(403).json({ message: 'เฉพาะเจ้าของพื้นที่เท่านั้นที่ส่งรายงานการแก้ไขได้' });
        }

        const { detail, photoUrl } = req.body;
        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });

        assessment.status = 'Corrected';
        assessment.correctionData = {
            detail: detail || '',
            photoUrl: photoUrl || '',
            submittedAt: new Date()
        };

        await assessment.save();
        res.json({ success: true, message: 'ส่งรายงานผลการปรับปรุงสถานที่เรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});

// 6. Admin รับรองผลการประเมิน
router.patch('/:id/approve', verifyToken, adminOnly, async (req, res) => {
    try {
        const assessment = await Assessment.findByIdAndUpdate(
            req.params.id,
            { status: 'Approved' },
            { new: true }
        );
        if (!assessment) return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });

        res.json({ success: true, message: 'รับรองผลการประเมินมาตรฐานเรียบร้อยแล้ว' });
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการรับรองผล' });
    }
});

// 7. Admin ส่งกลับไปแก้ไข
router.patch('/:id/reject', verifyToken, adminOnly, async (req, res) => {
    try {
        const { reason } = req.body;
        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) return res.status(404).json({ message: 'ไม่พบบันทึกรายการนี้' });

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

// 8. Admin แก้ไขคะแนนและข้อมูลประเมิน
router.patch('/:id/edit', verifyToken, adminOnly, async (req, res) => {
    try {
        const { percentage, createdAt, items, totalScore, scores } = req.body;
        const assessment = await Assessment.findById(req.params.id);

        if (!assessment) return res.status(404).json({ message: 'ไม่พบบันทึกการประเมินนี้' });

        if (percentage !== undefined) assessment.percentage = percentage;
        if (createdAt !== undefined) assessment.createdAt = createdAt;
        if (items !== undefined) assessment.items = items;
        if (scores !== undefined) assessment.scores = scores;
        if (totalScore !== undefined) assessment.totalScore = totalScore;

        if (percentage !== undefined && assessment.status !== 'Approved') {
            assessment.status = Number(percentage) < 80 ? 'Needs Improvement' : 'Passed';
        }

        await assessment.save();
        res.json({ success: true, message: 'บันทึกการแก้ไขเรียบร้อยแล้ว' });

    } catch (error) {
        console.error('Error editing assessment:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
    }
});

module.exports = router;
