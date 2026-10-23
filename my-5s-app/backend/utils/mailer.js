const nodemailer = require('nodemailer');
const SystemConfig = require('../models/SystemConfig');

// ---- ตั้งค่า ----
// ทางเลือก 1 (แนะนำถ้า server โฮสต์บนบริการที่บล็อกพอร์ต SMTP เช่น Render แผนฟรี):
//   ตั้ง RESEND_API_KEY และ MAIL_FROM ใน Environment Variables (MAIL_FROM ต้องเป็นอีเมลของโดเมนที่ยืนยันใน Resend แล้ว)
// ทางเลือก 2: ใช้ Gmail SMTP ด้วย adminEmail + App Password ที่บันทึกในหน้า Admin

function toRecipients(to) {
    const list = Array.isArray(to) ? to : String(to || '').split(',');
    return [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
}

function explainSmtpError(err) {
    const code = err && err.code;
    const msg = (err && err.message) || String(err);
    if (code === 'EAUTH' || /Invalid login|535/.test(msg)) {
        return 'ล็อกอิน Gmail ไม่สำเร็จ: ตรวจอีเมลผู้ส่งและ App Password (ต้องเปิดยืนยันตัวตน 2 ขั้นตอน และใช้ App Password 16 หลัก)';
    }
    if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(code)) {
        return 'เชื่อมต่อเซิร์ฟเวอร์ Gmail ไม่ได้ (พอร์ต SMTP อาจถูกบล็อกบนโฮสติ้ง) แนะนำให้ตั้ง RESEND_API_KEY และ MAIL_FROM แทน';
    }
    return 'ส่งอีเมลไม่สำเร็จ: ' + msg;
}

async function recordStatus(ok, to, error) {
    try {
        await SystemConfig.updateOne({}, {
            $set: {
                lastMailOk: ok,
                lastMailAt: new Date(),
                lastMailTo: toRecipients(to).join(', '),
                lastMailError: ok ? '' : String(error || '')
            }
        }, { upsert: true });
    } catch (e) {
        console.error('❌ บันทึกสถานะอีเมลไม่สำเร็จ:', e.message);
    }
}

async function getSmtpSettings() {
    const cfg = await SystemConfig.findOne().lean();
    const user = String((cfg && cfg.adminEmail) || '').trim();
    const pass = String((cfg && cfg.appPassword) || '').replace(/\s+/g, '');
    if (!user || !pass) return null;
    return { user, pass };
}

async function sendViaResend({ recipients, subject, text, html }) {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('ยังไม่ได้ตั้งค่า MAIL_FROM ใน Environment Variables');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: recipients, subject, text, html })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Resend ตอบกลับ ${res.status}: ${data.message || JSON.stringify(data)}`);
    return { sent: true, messageId: data.id };
}

async function sendViaSmtp({ recipients, subject, text, html }) {
    const settings = await getSmtpSettings();
    if (!settings) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่าอีเมลผู้ส่งและ App Password ในหน้า Admin' };

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: settings.user, pass: settings.pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });
    try {
        const info = await transporter.sendMail({
            from: `"Green 7S Plus" <${settings.user}>`,
            to: recipients.join(', '),
            subject, text, html
        });
        return { sent: true, messageId: info.messageId };
    } catch (err) {
        console.error('❌ SMTP error:', err.code || '', err.message);
        throw new Error(explainSmtpError(err));
    }
}

// ส่งอีเมล (to เป็นข้อความหรืออาร์เรย์ก็ได้) — throw ถ้าไม่สำเร็จ และบันทึกผลไว้เสมอ
async function sendMail({ to, subject, text, html }) {
    const recipients = toRecipients(to);
    if (recipients.length === 0) {
        await recordStatus(false, '', 'ไม่มีอีเมลผู้รับ');
        return { skipped: true, reason: 'ไม่มีอีเมลผู้รับ' };
    }

    try {
        const result = process.env.RESEND_API_KEY
            ? await sendViaResend({ recipients, subject, text, html })
            : await sendViaSmtp({ recipients, subject, text, html });

        if (result.skipped) {
            await recordStatus(false, recipients, result.reason);
            return result;
        }
        await recordStatus(true, recipients, '');
        return result;
    } catch (err) {
        await recordStatus(false, recipients, err.message);
        throw err;
    }
}

// ส่งแบบแจ้งเตือนอัตโนมัติ: ไม่ throw และไม่รอผล เพื่อไม่ให้การบันทึกข้อมูลล้มเหลวเพราะอีเมล
function notify(opts) {
    sendMail(opts)
        .then(r => { if (r && r.skipped) console.warn('⚠️ ข้ามการส่งอีเมล:', r.reason); })
        .catch(err => console.error('❌ ส่งอีเมลแจ้งเตือนไม่สำเร็จ:', err.message));
}

// สถานะระบบอีเมลสำหรับหน้าตรวจสอบ (ไม่ส่งรหัสผ่านกลับ)
async function getMailStatus() {
    const cfg = await SystemConfig.findOne().lean();
    return {
        provider: process.env.RESEND_API_KEY ? 'resend' : 'smtp',
        resendReady: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
        mailFrom: process.env.MAIL_FROM || '',
        smtpReady: !!(cfg && cfg.adminEmail && cfg.appPassword),
        adminEmail: (cfg && cfg.adminEmail) || '',
        lastMailOk: cfg ? cfg.lastMailOk : null,
        lastMailAt: cfg ? cfg.lastMailAt : null,
        lastMailTo: cfg ? cfg.lastMailTo : '',
        lastMailError: cfg ? cfg.lastMailError : ''
    };
}

module.exports = { sendMail, notify, getMailStatus, toRecipients };
