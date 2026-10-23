const nodemailer = require('nodemailer');
const SystemConfig = require('../models/SystemConfig');

// ลำดับการเลือกผู้ให้บริการ
//  1) ค่าที่แอดมินตั้งในหน้าเว็บ (SystemConfig.mailProvider)
//     - 'mailjet' ใช้ mailjetApiKey / mailjetSecretKey / mailFrom ที่บันทึกไว้
//     - 'smtp'    ใช้ Gmail ด้วย adminEmail + appPassword (ใช้ไม่ได้บน Render แผนฟรี)
//  2) ถ้ายังไม่ได้ตั้งในหน้าเว็บ ใช้ Environment Variables: RESEND_API_KEY, BREVO_API_KEY, หรือ MAILJET_API_KEY + MAILJET_SECRET_KEY (พร้อม MAIL_FROM)
//  3) ไม่มีทั้งหมดจะใช้ SMTP

async function loadConfig() {
    return (await SystemConfig.findOne().lean()) || {};
}

async function resolveProvider(cfg) {
    if (cfg.mailProvider === 'mailjet') {
        const apiKey = cfg.mailjetApiKey;
        const secret = cfg.mailjetSecretKey;
        const from = cfg.mailFrom;
        return { provider: 'mailjet', apiKey, secret, from, ready: !!(apiKey && secret && from) };
    }
    if (cfg.mailProvider === 'smtp') {
        return { provider: 'smtp', ready: !!(cfg.adminEmail && cfg.appPassword) };
    }
    // ยังไม่ได้ตั้งในหน้าเว็บ -> ใช้ Environment Variables
    if (process.env.RESEND_API_KEY) {
        return { provider: 'resend', from: process.env.MAIL_FROM, ready: !!process.env.MAIL_FROM };
    }
    if (process.env.BREVO_API_KEY) {
        return { provider: 'brevo', from: process.env.MAIL_FROM, ready: !!process.env.MAIL_FROM };
    }
    if (process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) {
        return {
            provider: 'mailjet',
            apiKey: process.env.MAILJET_API_KEY,
            secret: process.env.MAILJET_SECRET_KEY,
            from: process.env.MAIL_FROM,
            ready: !!process.env.MAIL_FROM
        };
    }
    return { provider: 'smtp', ready: !!(cfg.adminEmail && cfg.appPassword) };
}

function toRecipients(to) {
    const list = Array.isArray(to) ? to : String(to || '').split(',');
    return [...new Set(list.map(s => String(s).trim()).filter(Boolean))];
}

async function recordStatus(ok, to, error, messageId) {
    try {
        await SystemConfig.updateOne({}, {
            $set: {
                lastMailOk: ok,
                lastMailAt: new Date(),
                lastMailTo: toRecipients(to).join(', '),
                lastMailError: ok ? '' : String(error || ''),
                lastMailMessageId: ok && messageId ? String(messageId) : ''
            }
        }, { upsert: true });
    } catch (e) {
        console.error('❌ บันทึกสถานะอีเมลไม่สำเร็จ:', e.message);
    }
}

function explainHttpError(provider, status, data) {
    const detail = (data && (data.message || data.error || data.ErrorMessage)) || JSON.stringify(data || {});
    if (status === 401 || status === 403) return `${provider}: คีย์ API ไม่ถูกต้องหรือไม่มีสิทธิ์ (${status}) ${detail}`;
    if (status === 400 || status === 422) return `${provider}: ข้อมูลอีเมลไม่ถูกต้อง หรืออีเมลผู้ส่งยังไม่ได้ยืนยัน (${status}) ${detail}`;
    return `${provider}: ส่งไม่สำเร็จ (${status}) ${detail}`;
}

async function sendViaMailjet({ apiKey, secret, from, recipients, subject, text, html }) {
    if (!from) throw new Error('ยังไม่ได้กรอกอีเมลผู้ส่ง (ต้องเป็นอีเมลที่ยืนยันแล้วใน Mailjet)');
    const auth = Buffer.from(`${apiKey}:${secret}`).toString('base64');
    const message = {
        From: { Email: from, Name: 'Green 7S Plus' },
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
    const first = data.Messages && data.Messages[0];
    if (!first || first.Status !== 'success') {
        throw new Error(`Mailjet ตอบสถานะ ${first ? first.Status : 'ไม่ทราบ'}: ${JSON.stringify(data)}`);
    }
    return { sent: true, messageId: first.To && first.To[0] && first.To[0].MessageID };
}

async function sendViaResend({ recipients, subject, text, html, from }) {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, subject, text, html })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(explainHttpError('Resend', res.status, data));
    return { sent: true, messageId: data.id };
}

async function sendViaBrevo({ recipients, subject, text, html, from }) {
    const body = {
        sender: { name: 'Green 7S Plus', email: from },
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

async function sendViaSmtp({ cfg, recipients, subject, text, html }) {
    const user = String(cfg.adminEmail || '').trim();
    const pass = String(cfg.appPassword || '').replace(/\s+/g, '');
    if (!user || !pass) return { skipped: true, reason: 'ยังไม่ได้ตั้งค่าอีเมลผู้ส่งและ App Password ในหน้า Admin' };

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000
    });
    try {
        const info = await transporter.sendMail({
            from: `"Green 7S Plus" <${user}>`,
            to: recipients.join(', '),
            subject, text, html
        });
        return { sent: true, messageId: info.messageId };
    } catch (err) {
        const code = err.code || '';
        const hint = ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED'].includes(code)
            ? 'เชื่อมต่อ Gmail SMTP ไม่ได้ (โฮสติ้งบล็อกพอร์ต SMTP) ให้เปลี่ยนเป็น Mailjet ในหน้าตั้งค่า'
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

    const cfg = await loadConfig();
    const p = await resolveProvider(cfg);
    try {
        if (!p.ready && p.provider !== 'smtp') {
            throw new Error(`ยังตั้งค่า ${p.provider} ไม่ครบ (กรุณากรอกคีย์และอีเมลผู้ส่งในหน้าตั้งค่า)`);
        }
        const args = { recipients, subject, text, html, from: p.from, cfg, apiKey: p.apiKey, secret: p.secret };
        const result = p.provider === 'mailjet' ? await sendViaMailjet(args)
            : p.provider === 'resend' ? await sendViaResend(args)
            : p.provider === 'brevo' ? await sendViaBrevo(args)
            : await sendViaSmtp(args);

        if (result.skipped) {
            await recordStatus(false, recipients, result.reason);
            return result;
        }
        await recordStatus(true, recipients, '', result.messageId);
        return result;
    } catch (err) {
        console.error(`❌ ส่งอีเมลไม่สำเร็จ (${p.provider}):`, err.message);
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

// สถานะสำหรับหน้าตรวจสอบ (ไม่ส่งคีย์หรือรหัสผ่านกลับ)
async function getMailStatus() {
    const cfg = await loadConfig();
    const p = await resolveProvider(cfg);
    return {
        provider: p.provider,
        ready: !!p.ready,
        mailFrom: p.from || cfg.mailFrom || '',
        adminEmail: cfg.adminEmail || '',
        lastMailOk: cfg.lastMailOk ?? null,
        lastMailAt: cfg.lastMailAt || null,
        lastMailTo: cfg.lastMailTo || '',
        lastMailError: cfg.lastMailError || '',
        lastMailMessageId: cfg.lastMailMessageId || ''
    };
}

module.exports = { sendMail, notify, getMailStatus, toRecipients };
