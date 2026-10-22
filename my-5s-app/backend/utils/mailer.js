const nodemailer = require('nodemailer');
const SystemConfig = require('../models/SystemConfig');

// อ่านบัญชีผู้ส่งจาก System Config ทุกครั้ง (แก้ไขในหน้า Admin แล้วมีผลทันที ไม่ต้อง restart)
async function getMailSettings() {
    const cfg = await SystemConfig.findOne().lean();
    const user = String((cfg && cfg.adminEmail) || '').trim();
    // App Password ของ Gmail มักมีช่องว่างคั่น เช่น "abcd efgh ijkl mnop" -> ตัดช่องว่างออก
    const pass = String((cfg && cfg.appPassword) || '').replace(/\s+/g, '');
    if (!user || !pass) return null;
    return { user, pass };
}

// ส่งอีเมลโดยตรง (ใช้กับปุ่มทดสอบ) — ถ้าส่งไม่สำเร็จจะ throw error
async function sendMail({ to, subject, text, html }) {
    if (!to) return { skipped: true, reason: 'ไม่มีอีเมลผู้รับ' };

    const settings = await getMailSettings();
    if (!settings) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่าบัญชีผู้ส่งและ App Password' };

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: settings.user, pass: settings.pass }
    });

    const info = await transporter.sendMail({
        from: `"Green 7S Plus" <${settings.user}>`,
        to,
        subject,
        text,
        html
    });
    return { sent: true, messageId: info.messageId };
}

// ส่งแบบแจ้งเตือนอัตโนมัติ: ไม่ throw และไม่รอผล เพื่อไม่ให้การบันทึกข้อมูลในระบบล้มเหลวเพราะอีเมล
function notify(opts) {
    sendMail(opts)
        .then(r => { if (r && r.skipped) console.warn('⚠️ ข้ามการส่งอีเมล:', r.reason); })
        .catch(err => console.error('❌ ส่งอีเมลไม่สำเร็จ:', err.message));
}

module.exports = { sendMail, notify, getMailSettings };
