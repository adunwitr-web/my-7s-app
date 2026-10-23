const nodemailer = require('nodemailer');
const SystemConfig = require('../models/SystemConfig');

// อ่านบัญชีผู้ส่งจากการตั้งค่าระบบทุกครั้ง (แก้ในหน้า Admin แล้วมีผลทันที)
async function getMailSettings() {
    const cfg = await SystemConfig.findOne().lean();
    const user = String((cfg && cfg.adminEmail) || '').trim();
    // App Password ของ Gmail มักมีช่องว่าง เช่น "abcd efgh ijkl mnop" -> ตัดออก
    const pass = String((cfg && cfg.appPassword) || '').replace(/\s+/g, '');
    if (!user || !pass) return null;
    return { user, pass };
}

// แปลง error ของ SMTP ให้เป็นข้อความที่เข้าใจได้
function explainMailError(err) {
    const code = err && err.code;
    const msg = (err && err.message) || String(err);
    if (code === 'EAUTH' || /Invalid login|535/.test(msg)) {
        return 'ล็อกอินอีเมลไม่สำเร็จ: ตรวจสอบอีเมลผู้ส่งและ App Password (ต้องเปิดยืนยันตัวตน 2 ขั้นตอนก่อน และใช้ App Password 16 หลัก ไม่ใช่รหัสผ่านปกติ)';
    }
    if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNREFUSED') {
        return 'เชื่อมต่อเซิร์ฟเวอร์ Gmail ไม่ได้ (พอร์ต SMTP อาจถูกบล็อกบนเซิร์ฟเวอร์โฮสติ้ง เช่น Render แผนฟรี) ต้องใช้บริการอีเมลแบบ HTTP API แทน';
    }
    return 'ส่งอีเมลไม่สำเร็จ: ' + msg;
}

// ส่งอีเมล (throw ถ้าไม่สำเร็จ ใช้กับปุ่มทดสอบ)
async function sendMail({ to, subject, text, html }) {
    if (!to) return { skipped: true, reason: 'ไม่มีอีเมลผู้รับ' };

    const settings = await getMailSettings();
    if (!settings) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่าบัญชีผู้ส่งและ App Password' };

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
            to,
            subject,
            text,
            html
        });
        return { sent: true, messageId: info.messageId };
    } catch (err) {
        console.error('❌ SMTP error:', err.code || '', err.message);
        throw new Error(explainMailError(err));
    }
}

// ส่งแบบแจ้งเตือนอัตโนมัติ: ไม่ throw และไม่รอผล เพื่อไม่ให้การบันทึกข้อมูลล้มเหลวเพราะอีเมล
function notify(opts) {
    sendMail(opts)
        .then(r => { if (r && r.skipped) console.warn('⚠️ ข้ามการส่งอีเมล:', r.reason); })
        .catch(err => console.error('❌ ส่งอีเมลแจ้งเตือนไม่สำเร็จ:', err.message));
}

module.exports = { sendMail, notify, getMailSettings };
