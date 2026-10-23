const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Assessment = require('../models/Assessment');
const Area = require('../models/Area');
const User = require('../models/user');
const { verifyToken, checkRole } = require('../middleware/auth');
const SystemConfig = require('../models/SystemConfig');
const { notify } = require('../utils/mailer');

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

// ---- การแจ้งเตือนทางอีเมล ----
// เจ้าของพื้นที่ = Area.owner -> อีเมลของผู้ใช้คนนั้น (ถ้าไม่มี ส่งเข้าบัญชีผู้ดูแลระบบแทน)
async function getAdminEmail() {
    const cfg = await SystemConfig.findOne().lean();
    return (cfg && cfg.adminEmail) || '';
}

const MAIL_FOOTER = '\n\n— ระบบ Green 7S Plus วิทยาลัยรัตภูมิ\n(อีเมลนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ)';

// แจ้งเจ้าของพื้นที่ (หรือผู้ดูแลระบบถ้าพื้นที่ไม่มีเจ้าของ)
function notifyAreaOwner(area, subject, body) {
    (async () => {
        let to = '';
        let greeting = 'เรียน เจ้าของพื้นที่';
        if (area && area.owner) {
            const owner = await User.findById(area.owner).select('email firstName lastName fullName').lean();
            if (owner && owner.email) {
                to = owner.email;
                greeting = `เรียน ${owner.fullName || `${owner.firstName || ''} ${owner.lastName || ''}`.trim()}`;
            }
        }
        if (!to) {
            to = await getAdminEmail();
            greeting = `เรียน ผู้ดูแลระบบ (พื้นที่ "${area ? area.areaName : '-'}" ยังไม่มีเจ้าของที่มีอีเมล)`;
        }
        if (!to) return console.warn('⚠️ ไม่มีอีเมลผู้รับสำหรับการแจ้งเตือน:', area && area.areaName);
        notify({ to, subject, text: `${greeting}\n\n${body}${MAIL_FOOTER}` });
    })().catch(err => console.error('❌ เตรียมอีเมลแจ้งเตือนไม่สำเร็จ:', err.message));
}

// แจ้งผู้ดูแลระบบ
function notifyAdmin(subject, body) {
    (async () => {
        const to = await getAdminEmail();
        if (!to) return console.warn('⚠️ ยังไม่ได้ตั้งอีเมลผู้ดูแลระบบ จึงไม่ส่งการแจ้งเตือน');
        notify({ to, subject, text: `เรียน ผู้ดูแลระบบ\n\n${body}${MAIL_FOOTER}` });
    })().catch(err => console.error('❌ เตรียมอีเมลแจ้งเตือนไม่สำเร็จ:', err.message));
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
        const me = await User.findById(req.user.userId).select('role assignedArea assignedCategory assignedCategories').lean();
        if (me && me.role !== 'Admin') {
            // 🔒 ล็อคเฉพาะ "ส่วนพื้นที่ / หมวดหมู่" ที่รับผิดชอบ — ห้องย่อยไม่ถูกล็อค
            // ตรวจจากหมวดของห้องใน DB เท่านั้น ไม่เชื่อค่า category ที่ Frontend ส่งมา
            // 🔒 ล็อคเฉพาะหมวดหมู่ที่รับผิดชอบ (อาจมีหลายหมวด) — ตรวจจากหมวดของห้องใน DB
            const lock = await User.describeAssignment(me);
            const lockCats = lock.assignedCategories;
            if (lockCats.length) {
                const allowed = !!foundArea && lockCats.some(c => categoryMatches(foundArea.category, c));
                if (!allowed) {
                    return res.status(403).json({ message: `คุณมีสิทธิ์ประเมินเฉพาะหมวดหมู่ "${lockCats.join('", "')}" เท่านั้น` });
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

        // แจ้งเจ้าของพื้นที่เมื่อผลต่ำกว่าเกณฑ์ (ส่งหลังบันทึกสำเร็จ ไม่กระทบการตอบกลับ)
        if (evaluationStatus === 'Needs Improvement') {
            const targetArea = await Area.findById(area).lean();
            if (targetArea) {
                notifyAreaOwner(
                    targetArea,
                    `[Green 7S Plus] ผลการประเมินต่ำกว่าเกณฑ์: ${targetArea.areaName}`,
                    `สถานที่ "${targetArea.areaName}" มีผลการประเมินร้อยละ ${percentage} (ต่ำกว่าเกณฑ์มาตรฐานร้อยละ 80)\n` +
                    `รอบการประเมิน: ${assessmentRound}\n` +
                    (assessorComment ? `ข้อเสนอแนะ: ${assessorComment}\n` : '') +
                    `\nกรุณาเข้าสู่ระบบเพื่อดำเนินการปรับปรุงแก้ไขและส่งรายงานผล`
                );
            }
        }

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
        const currentUser = await User.findById(userId).select('assignedArea assignedCategory assignedCategories').lean();

        const idSet = new Set();

        // ห้องที่ผู้ใช้เป็นเจ้าของ (Area.owner)
        const ownedAreas = await Area.find({ owner: userId }).select('_id');
        ownedAreas.forEach(a => idSet.add(String(a._id)));

        // ขอบเขตของเจ้าของ: ถ้าผูกกับ "ห้อง" จะเห็นเฉพาะห้องนั้น (ไม่เห็นห้องอื่นในหมวดเดียวกัน)
        // ถ้าไม่ได้ผูกห้อง แต่มีหมวดรับผิดชอบ จะเห็นทุกห้องในหมวดนั้น
        if (currentUser) {
            // ขอบเขตของเจ้าของ: ถ้าผูกกับห้อง เห็นเฉพาะห้องนั้น
            // ถ้าไม่ได้ผูกห้อง เห็นทุกห้องในทุกหมวดที่รับผิดชอบ
            const lock = await User.describeAssignment(currentUser);
            if (lock.assignedArea) {
                idSet.add(lock.assignedArea);
            } else if (lock.assignedCategories.length) {
                const catAreas = await Area.find({ category: { $in: lock.assignedCategories } }).select('_id');
                catAreas.forEach(x => idSet.add(String(x._id)));
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

        const areaDoc = await Area.findById(assessment.area).lean();
        notifyAdmin(
            `[Green 7S Plus] มีรายงานการแก้ไขรอการรับรอง: ${areaDoc ? areaDoc.areaName : ''}`,
            `สถานที่ "${areaDoc ? areaDoc.areaName : '-'}" มีการส่งรายงานการแก้ไขแล้ว\n` +
            (detail ? `รายละเอียด: ${detail}\n` : '') +
            `\nกรุณาเข้าสู่ระบบเพื่อตรวจสอบและรับรองผล`
        );

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

        const areaDoc = await Area.findById(assessment.area).lean();
        if (areaDoc) {
            notifyAreaOwner(
                areaDoc,
                `[Green 7S Plus] รับรองผลการประเมินแล้ว: ${areaDoc.areaName}`,
                `ผลการประเมินของสถานที่ "${areaDoc.areaName}" ได้รับการรับรองเรียบร้อยแล้ว`
            );
        }

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

        const areaDoc = await Area.findById(assessment.area).lean();
        if (areaDoc) {
            notifyAreaOwner(
                areaDoc,
                `[Green 7S Plus] ผลการประเมินถูกส่งกลับให้แก้ไข: ${areaDoc.areaName}`,
                `สถานที่ "${areaDoc.areaName}" ถูกส่งกลับเพื่อดำเนินการปรับปรุงแก้ไข\n` +
                `เหตุผล: ${reason || 'ไม่ผ่านเกณฑ์มาตรฐาน'}\n\nกรุณาเข้าสู่ระบบเพื่อแก้ไขและส่งรายงานอีกครั้ง`
            );
        }

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
