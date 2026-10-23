const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const { verifyToken, checkRole } = require('../middleware/auth');
const { sendMail, getMailStatus } = require('../utils/mailer');

const adminOnly = checkRole(['Admin']);

function toDateOrNull(v) {
    if (v === undefined) return undefined;   // ไม่ส่งมา = ไม่แก้ไข
    if (v === null || v === '') return null; // ส่งค่าว่างมา = ล้างค่า
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

// GET /api/system-config — ตั้งค่าอีเมลผู้ดูแล (Admin) ไม่ส่งรหัสผ่านแอปกลับไปให้ Browser
router.get('/', verifyToken, adminOnly, async (req, res) => {
    try {
        let config = await SystemConfig.findOne();
        if (!config) config = await SystemConfig.create({ adminEmail: '', appPassword: '' });
        res.json({
            adminEmail: config.adminEmail || '',
            hasAppPassword: !!config.appPassword,
            activeRound: config.activeRound || '',
            academicYear: config.academicYear || '',
            roundStartDate: config.roundStartDate || null,
            roundEndDate: config.roundEndDate || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching config' });
    }
});

// POST /api/system-config (Admin)
router.post('/', verifyToken, adminOnly, async (req, res) => {
    try {
        const { adminEmail, appPassword } = req.body;
        let config = await SystemConfig.findOne();

        if (!config) {
            config = new SystemConfig({ adminEmail: adminEmail || '', appPassword: String(appPassword || '').replace(/\s+/g, '') });
        } else {
            if (adminEmail !== undefined) config.adminEmail = adminEmail;
            const pass = String(appPassword || '').replace(/\s+/g, '');
            if (pass !== '') config.appPassword = pass;
        }

        await config.save();
        res.json({ success: true, message: 'บันทึกการตั้งค่าสำเร็จ' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating config' });
    }
});

// GET /api/system-config/round — ผู้ใช้ทุกคนที่ Login ดูรอบประเมินได้
router.get('/round', verifyToken, async (req, res) => {
    try {
        const config = await SystemConfig.findOne();
        res.set('Cache-Control', 'no-store');
        if (!config) {
            return res.json({ activeRound: '', academicYear: '', roundStartDate: null, roundEndDate: null });
        }
        res.json({
            activeRound: config.activeRound || '',
            academicYear: config.academicYear || '',
            roundStartDate: config.roundStartDate || null,
            roundEndDate: config.roundEndDate || null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching round config' });
    }
});

// POST /api/system-config/round (Admin) — บันทึกเฉพาะฟิลด์ที่ส่งมา
router.post('/round', verifyToken, adminOnly, async (req, res) => {
    try {
        const { activeRound, academicYear, roundStartDate, roundEndDate } = req.body;
        let config = await SystemConfig.findOne();
        if (!config) config = new SystemConfig({ adminEmail: '', appPassword: '' });

        if (activeRound !== undefined) config.activeRound = String(activeRound || '').trim();
        if (academicYear !== undefined) config.academicYear = String(academicYear || '').trim();

        const start = toDateOrNull(roundStartDate);
        const end = toDateOrNull(roundEndDate);
        if (start !== undefined) config.roundStartDate = start;
        if (end !== undefined) config.roundEndDate = end;

        await config.save();
        res.json({ success: true, message: 'บันทึกรอบการประเมินและระยะเวลาสำเร็จ' });
    } catch (error) {
        console.error('Error updating round config:', error);
        res.status(500).json({ message: 'เซิร์ฟเวอร์เกิดข้อผิดพลาดในการบันทึกรอบประเมิน' });
    }
});

// GET /api/system-config/mail-status (Admin) — ตรวจสถานะระบบอีเมล (ไม่แสดงรหัสผ่าน)
router.get('/mail-status', verifyToken, adminOnly, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await getMailStatus());
    } catch (error) {
        res.status(500).json({ message: 'ตรวจสถานะอีเมลไม่สำเร็จ: ' + error.message });
    }
});

// POST /api/system-config/test-mail (Admin) — ส่งอีเมลทดสอบ (ส่งไปที่ body.to ถ้ามี ไม่งั้นส่งไปบัญชีผู้ส่ง)
router.post('/test-mail', verifyToken, adminOnly, async (req, res) => {
    try {
        const config = await SystemConfig.findOne().lean();
        const to = String((req.body && req.body.to) || (config && config.adminEmail) || '').trim();
        if (!to) return res.status(400).json({ message: 'ไม่มีอีเมลผู้รับ กรุณาระบุอีเมลปลายทาง' });

        const result = await sendMail({
            to,
            subject: '[Green 7S Plus] ทดสอบระบบส่งอีเมลแจ้งเตือน',
            text: 'ระบบส่งอีเมลแจ้งเตือนของ Green 7S Plus ทำงานปกติ'
        });
        if (result.skipped) return res.status(400).json({ message: result.reason });
        res.json({ success: true, message: `ส่งอีเมลทดสอบไปที่ ${to} แล้ว` });
    } catch (error) {
        console.error('❌ test-mail error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/system-config/mail-settings (Admin) — ค่าการส่งอีเมลที่ตั้งจากหน้าเว็บ (ไม่ส่งคีย์เต็มกลับ)
router.get('/mail-settings', verifyToken, adminOnly, async (req, res) => {
    try {
        const cfg = (await SystemConfig.findOne().lean()) || {};
        const key = String(cfg.mailjetApiKey || '');
        res.set('Cache-Control', 'no-store');
        res.json({
            mailProvider: cfg.mailProvider || '',
            mailFrom: cfg.mailFrom || '',
            mailjetApiKeyMasked: key ? '•••• ' + key.slice(-4) : '',
            hasMailjetSecret: !!cfg.mailjetSecretKey
        });
    } catch (error) {
        res.status(500).json({ message: 'โหลดการตั้งค่าอีเมลไม่สำเร็จ: ' + error.message });
    }
});

// POST /api/system-config/mail-settings (Admin) — บันทึกค่า Mailjet/ผู้ส่งจากหน้าเว็บ
// ช่องคีย์ที่ส่งมาว่าง = คงค่าเดิมไว้ (จะได้ไม่ต้องกรอกซ้ำทุกครั้ง)
router.post('/mail-settings', verifyToken, adminOnly, async (req, res) => {
    try {
        const b = req.body || {};
        const provider = String(b.mailProvider || '').trim();
        if (!['mailjet', 'smtp', ''].includes(provider)) {
            return res.status(400).json({ message: 'ผู้ให้บริการไม่ถูกต้อง' });
        }
        const from = String(b.mailFrom || '').trim();
        if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
            return res.status(400).json({ message: 'รูปแบบอีเมลผู้ส่งไม่ถูกต้อง' });
        }

        let config = await SystemConfig.findOne();
        if (!config) config = new SystemConfig({ adminEmail: '', appPassword: '' });

        config.mailProvider = provider;
        config.mailFrom = from;
        const apiKey = String(b.mailjetApiKey || '').trim();
        const secret = String(b.mailjetSecretKey || '').trim();
        if (apiKey) config.mailjetApiKey = apiKey;
        if (secret) config.mailjetSecretKey = secret;

        if (provider === 'mailjet' && (!config.mailjetApiKey || !config.mailjetSecretKey || !config.mailFrom)) {
            await config.save();
            return res.status(400).json({ message: 'บันทึกแล้ว แต่ยังขาดข้อมูล: กรุณากรอก API Key, Secret Key และอีเมลผู้ส่งให้ครบ' });
        }

        await config.save();
        res.json({ success: true, message: 'บันทึกการตั้งค่าอีเมลสำเร็จ' });
    } catch (error) {
        console.error('Error saving mail settings:', error.message);
        res.status(500).json({ message: 'บันทึกการตั้งค่าอีเมลไม่สำเร็จ: ' + error.message });
    }
});

// ---- Mailjet Single Sender Verification ----
// Mailjet จะส่งลิงก์ยืนยันไปยังกล่องจดหมายของอีเมลนั้น ผู้รับต้องกดลิงก์เพื่อยืนยันก่อนจึงส่งอีเมลได้
const isEmailAddr = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));

async function mailjetCall(method, path, body) {
    const cfg = (await SystemConfig.findOne().lean()) || {};
    const apiKey = cfg.mailjetApiKey || process.env.MAILJET_API_KEY || '';
    const secret = cfg.mailjetSecretKey || process.env.MAILJET_SECRET_KEY || '';
    if (!apiKey || !secret) throw new Error('ยังไม่ได้ตั้งค่า API Key และ Secret Key ของ Mailjet');
    const res = await fetch('https://api.mailjet.com' + path, {
        method,
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${secret}`).toString('base64'),
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

// อ่านสถานะผู้ส่งจาก Mailjet (ไม่พบ = null)
async function fetchSenderStatus(email) {
    const r = await mailjetCall('GET', `/v3/REST/sender/${encodeURIComponent(email)}`);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error((r.data && (r.data.ErrorMessage || r.data.message)) || `Mailjet ตอบ ${r.status}`);
    const item = r.data && r.data.Data && r.data.Data[0];
    return item ? String(item.Status || '') : null;
}

// POST /api/system-config/mail-sender (Admin) — ขอให้ Mailjet ส่งลิงก์ยืนยันไปยังอีเมลผู้ส่ง
router.post('/mail-sender', verifyToken, adminOnly, async (req, res) => {
    try {
        const email = String((req.body && req.body.email) || '').trim();
        const name = String((req.body && req.body.name) || 'Green 7S Plus').trim();
        if (!isEmailAddr(email)) return res.status(400).json({ message: 'รูปแบบอีเมลไม่ถูกต้อง' });

        // ถ้าเคยลงทะเบียนแล้ว Mailjet จะตอบ error ซึ่งไม่เป็นไร ให้ไปอ่านสถานะปัจจุบันแทน
        const created = await mailjetCall('POST', '/v3/REST/sender', { Email: email, Name: name });
        const status = await fetchSenderStatus(email);

        if (status === null) {
            const reason = (created.data && (created.data.ErrorMessage || created.data.message)) || `Mailjet ตอบ ${created.status}`;
            return res.status(400).json({ message: 'ส่งลิงก์ยืนยันไม่สำเร็จ: ' + reason });
        }
        if (status === 'Active') {
            return res.json({ success: true, status, message: `อีเมล ${email} ได้รับการยืนยันแล้ว สามารถใช้เป็นผู้ส่งได้เลย` });
        }
        res.json({
            success: true,
            status,
            message: created.ok
                ? `ส่งลิงก์ยืนยันไปที่ ${email} แล้ว กรุณาเปิดอีเมลแล้วกดยืนยัน (ถ้าไม่เห็น ให้ตรวจโฟลเดอร์ Junk/Spam)`
                : `อีเมล ${email} ลงทะเบียนไว้แล้ว สถานะปัจจุบัน: ${status} (ถ้ายังไม่ได้ยืนยัน ให้กดลิงก์ในอีเมลที่ Mailjet ส่งไว้)`
        });
    } catch (error) {
        console.error('Mailjet sender error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/system-config/mail-sender?email=... (Admin) — ตรวจว่าอีเมลนี้ยืนยันแล้วหรือยัง
// ถ้ายืนยันแล้วจะบันทึกเป็นอีเมลผู้ส่งที่ใช้งานจริงให้อัตโนมัติ
router.get('/mail-sender', verifyToken, adminOnly, async (req, res) => {
    try {
        const email = String(req.query.email || '').trim();
        if (!isEmailAddr(email)) return res.status(400).json({ message: 'รูปแบบอีเมลไม่ถูกต้อง' });
        const status = await fetchSenderStatus(email);
        if (status === null) return res.json({ email, status: 'NotFound', active: false, message: 'ยังไม่ได้ส่งลิงก์ยืนยันอีเมลนี้' });

        const active = status === 'Active';
        if (active) {
            await SystemConfig.updateOne({}, { $set: { mailFrom: email } }, { upsert: true });
        }
        res.json({
            email,
            status,
            active,
            message: active ? 'ยืนยันแล้ว ใช้เป็นอีเมลผู้ส่งได้' : 'ยังไม่ยืนยัน กรุณากดลิงก์ในอีเมลที่ Mailjet ส่งไปให้'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/system-config/mail-delivery (Admin) — ดูสถานะการส่งอีเมลล่าสุดจริงจาก Mailjet
// (สถานะ "สำเร็จ" ในระบบหมายถึง Mailjet รับคำขอแล้ว ส่วนหน้านี้บอกว่าข้อความไปถึงผู้รับหรือไม่)
router.get('/mail-delivery', verifyToken, adminOnly, async (req, res) => {
    try {
        const cfg = (await SystemConfig.findOne().lean()) || {};
        const id = String(cfg.lastMailMessageId || '').trim();
        if (!id) {
            return res.json({ found: false, message: 'ยังไม่มี MessageID ของการส่งล่าสุด (ลองกดส่งทดสอบใหม่หนึ่งครั้ง)' });
        }
        const r = await mailjetCall('GET', `/v3/REST/message/${encodeURIComponent(id)}`);
        if (!r.ok) {
            return res.json({ found: false, message: 'Mailjet ไม่พบข้อความนี้ (' + r.status + ') อาจยังไม่ถูกบันทึกหรือบัญชีอยู่ใน Sandbox' });
        }
        const item = r.data && r.data.Data && r.data.Data[0];
        if (!item) return res.json({ found: false, message: 'Mailjet ไม่ส่งรายละเอียดข้อความกลับมา' });

        const hints = {
            queued: 'อยู่ในคิว กำลังรอส่ง',
            sent: 'ส่งออกจาก Mailjet แล้ว แต่ยังไม่มีการยืนยันถึงกล่องจดหมาย',
            opened: 'ผู้รับเปิดอ่านแล้ว (ถึงกล่องจดหมายแล้ว)',
            clicked: 'ผู้รับคลิกลิงก์ในอีเมลแล้ว (ถึงกล่องจดหมายแล้ว)',
            bounce: 'ตีกลับ: ที่อยู่ผู้รับไม่มีอยู่จริง หรือเซิร์ฟเวอร์ปลายทางปฏิเสธ',
            blocked: 'ถูกบล็อก: เซิร์ฟเวอร์ปลายทางไม่รับอีเมลจากผู้ส่งนี้ (มักเกิดจากผู้ส่งไม่ผ่านการตรวจสอบ)',
            spam: 'ผู้รับแจ้งว่าเป็นสแปม',
            unsub: 'ผู้รับยกเลิกการรับอีเมล'
        };
        const st = String(item.Status || '').toLowerCase();
        res.json({
            found: true,
            status: item.Status,
            arrivedAt: item.ArrivedAt || null,
            sentAt: item.SentAt || null,
            to: cfg.lastMailTo || '',
            message: hints[st] || ('สถานะ: ' + item.Status),
            messageId: id
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
