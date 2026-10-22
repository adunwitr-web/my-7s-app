const jwt = require('jsonwebtoken');

// Middleware 1: ตรวจสอบ Token (รองรับทั้ง "Bearer <token>" และ token ตรงๆ)
const verifyToken = (req, res, next) => {
    const header = req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();

    if (!token) {
        return res.status(401).json({
            message: 'ปฏิเสธการเข้าถึง: กรุณาเข้าสู่ระบบ',
            error: 'ปฏิเสธการเข้าถึง: กรุณาเข้าสู่ระบบ'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const uid = decoded.userId || decoded.id || decoded._id;
        // ทำให้ทุกไฟล์ใช้ req.user.userId / id / _id ได้เหมือนกันหมด
        req.user = { ...decoded, userId: uid, id: uid, _id: uid };
        next();
    } catch (err) {
        return res.status(401).json({
            message: 'Token ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่',
            error: 'Token ไม่ถูกต้อง หรือหมดอายุแล้ว'
        });
    }
};

// Middleware 2: ตรวจสอบ Role (เช่น ให้ผ่านเฉพาะ Admin)
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้',
                error: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้'
            });
        }
        next();
    };
};

module.exports = { verifyToken, checkRole };
