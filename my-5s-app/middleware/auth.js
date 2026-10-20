const jwt = require('jsonwebtoken');

// Middleware 1: ตรวจสอบว่าได้ Login และมี Token หรือไม่
const verifyToken = (req, res, next) => {
    // ปกติ Token จะส่งมาใน Header ในรูปแบบ "Bearer <token>"
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'ปฏิเสธการเข้าถึง: กรุณาเข้าสู่ระบบ' });

    try {
        // ถอดรหัส Token ด้วย Secret Key ของเรา
        const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        req.user = verified; // เก็บข้อมูล user (id, role) ที่ถอดได้ไว้ใน request
        next(); // ให้ทำงานขั้นต่อไปได้
    } catch (err) {
        res.status(400).json({ error: 'Token ไม่ถูกต้อง หรือหมดอายุแล้ว' });
    }
};

// Middleware 2: ตรวจสอบ Role (เช่น ให้ผ่านเฉพาะ Admin)
const checkRole = (roles) => {
    return (req, res, next) => {
        // เช็คว่า Role ของคนที่ล็อกอินตรงกับที่ API อนุญาตหรือไม่
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' });
        }
        next();
    };
};

module.exports = { verifyToken, checkRole };