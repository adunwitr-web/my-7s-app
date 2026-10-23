const nodemailer = require('nodemailer');
const SystemConfig = require('../models/SystemConfig');

// ผู้ให้บริการที่รองรับ (เลือกจาก Environment Variables ของ Render)
//  1) RESEND_API_KEY  + MAIL_FROM  -> Resend (ต้องยืนยันโดเมนก่อน)
//  2) BREVO_API_KEY   + MAIL_FROM  -> Brevo (ยืนยันแค่อีเมลผู้ส่งก็ใช้ได้ ไม่ต้องมีโดเมน)
//  3) ไม่มีทั้งสอง     -> Gmail SMTP (ใช้ไม่ได้บน Render เพราะพอร์ต SMTP ถูกบล็อก)
// หมายเหตุ: MAIL_FROM = อีเมลผู้ส่งที่ยืนยันแล้วในผู้ให้บริการนั้น

function activeProvider() {
    if (process.env.RESEND_API_KEY) return 'resend';
    if (process.env.BREVO_API_KEY) return 'brevo';
    if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) return 'mailjet';
    return 'smtp';
}

function toRecipients(to) {
    const list = Array.isArray(to) ? to : String(to || '').split(',');
    return [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
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

function explainHttpError(provider, status, data) {
    const detail = (data && (data.message || data.error)) || JSON.stringify(data || {});
    if (status === 401 || status === 403) return `${provider}: คีย์ API ไม่ถูกต้องหรือไม่มีสิทธิ์ (${status}) ${detail}`;
    if (status === 400 || status === 422) return `${provider}: ข้อมูลอีเมลไม่ถูกต้อง หรือ MAIL_FROM ยังไม่ได้ยืนยัน (${status}) ${detail}`;
    return `${provider}: ส่งไม่สำเร็จ (${status}) ${detail}`;
}

async function sendViaResend({ recipients, subject, text, html }) {
    const from = process.env.MAIL_FROM;
    if (!from) throw new Error('ยังไม่ได้ตั้งค่า MAIL_FROM ใน Environment Variables');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject, text, html })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explainHttpError('Resend', res.status, data));
    return { sent: true, messageId: data.id };
}

async function sendViaBrevo({ recipients, subject, text, html }) {
    const sender = process.env.MAIL_FROM;
    if (!sender) throw new Error('ยังไม่ได้ตั้งค่า MAIL_FROM ใน Environment Variables (ใช้อีเมลผู้ส่งที่ยืนยันใน Brevo แล้ว)');
    const body = {
        sender: { name: 'Green 7S Plus', email: sender },
        to: recipients.map(email => ({ email })),
        subject,
        textContent: text || ' '
    };
    if (html) body.htmlContent = html;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explainHttpError('Brevo', res.status, data));
    return { sent: true, messageId: data.messageId };
}

// Mailjet: ใช้ API Key + Secret Key (Basic Auth) ยืนยันแค่อีเมลผู้ส่งก็ใช้ได้ ไม่ต้องมีโดเมน
async function sendViaMailjet({ recipients, subject, text, html }) {
    const sender = process.env.MAIL_FROM;
    if (!sender) throw new Error('ยังไม่ได้ตั้งค่า MAIL_FROM ใน Environment Variables (ใช้อีเมลผู้ส่งที่ยืนยันใน Mailjet แล้ว)');
    const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString('base64');
    const message = {
        From: { Email: sender, Name: 'Green 7S Plus' },
        To: recipients.map(Email => ({ Email })),
        Subject: subject,
        TextPart: text || ' '
    };
    if (html) message.HTMLPart = html;
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Messages: [message] })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explainHttpError('Mailjet', res.status, data));
    const status = data.Messages && data.Messages[0] && data.Messages[0].Status;
    if (status !== 'success') throw new Error(`Mailjet ตอบสถานะ ${status || 'ไม่ทราบ'}: ${JSON.stringify(data)}`);
    return { sent: true, messageId: data.Messages[0].To && data.Messages[0].To[0] && data.Messages[0].To[0].MessageID };
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
        const code = err.code || '';
        const hint = ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(code)
            ? 'เชื่อมต่อ Gmail SMTP ไม่ได้ (โฮสติ้งบล็อกพอร์ต SMTP) ให้ตั้ง BREVO_API_KEY หรือ RESEND_API_KEY แทน'
            : (code === 'EAUTH' ? 'ล็อกอิน Gmail ไม่สำเร็จ ตรวจอีเมลและ App Password' : err.message);
        throw new Error('SMTP: ' + hint);
    }
}

// ส่งอีเมล (to เป็นข้อความหรืออาร์เรย์) — throw ถ้าไม่สำเร็จ และบันทึกผลไว้เสมอ
async function sendMail({ to, subject, text, html }) {
    const recipients = toRecipients(to);
    if (recipients.length === 0) {
        await recordStatus(false, '', 'ไม่มีอีเมลผู้รับ');
        return { skipped: true, reason: 'ไม่มีอีเมลผู้รับ' };
    }

    const provider = activeProvider();
    try {
        const args = { recipients, subject, text, html };
        const result = provider === 'resend' ? await sendViaResend(args)
            : provider === 'brevo' ? await sendViaBrevo(args)
            : provider === 'mailjet' ? await sendViaMailjet(args)
            : await sendViaSmtp(args);

        if (result.skipped) {
            await recordStatus(false, recipients, result.reason);
            return result;
        }
        await recordStatus(true, recipients, '');
        return result;
    } catch (err) {
        console.error(`❌ ส่งอีเมลไม่สำเร็จ (${provider}):`, err.message);
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

// สถานะระบบอีเมลสำหรับหน้าตรวจสอบ (ไม่ส่งคีย์หรือรหัสผ่านกลับ)
async function getMailStatus() {
    const cfg = await SystemConfig.findOne().lean();
    const provider = activeProvider();
    const smtpReady = !!(cfg && cfg.adminEmail && cfg.appPassword);
    const httpReady = provider === 'resend'
        ? !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
        : provider === 'brevo' ? !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM)
        : provider === 'mailjet' ? !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY && process.env.MAIL_FROM)
        : false;
    return {
        provider,
        ready: provider === 'smtp' ? smtpReady : httpReady,
        mailFrom: process.env.MAIL_FROM || '',
        smtpReady,
        adminEmail: (cfg && cfg.adminEmail) || '',
        lastMailOk: cfg ? cfg.lastMailOk : null,
        lastMailAt: cfg ? cfg.lastMailAt : null,
        lastMailTo: cfg ? cfg.lastMailTo : '',
        lastMailError: cfg ? cfg.lastMailError : ''
    };
}

module.exports = { sendMail, notify, getMailStatus, toRecipients };
