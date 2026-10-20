const Area = require('../models/Area');

// ดึงรายการห้องตามประเภทพื้นที่ (category) และชื่อผู้รับผิดชอบ
exports.getRoomsByCategory = async (req, res) => {
    try {
        const { category } = req.query;
        const userName = req.user ? req.user.name : '';
        
        // ตัดคำเอาเฉพาะชื่อจริง เช่น "ภาวนา"
        const firstName = userName ? userName.split(' ')[0].replace(/^(ผศ\.|ดร\.|นางสาว|นาง|นาย)/, '') : '';

        const query = {
            category: category,
            $or: [
                { responsiblePersons: { $regex: firstName, $options: 'i' } },
                { assignedUsers: req.user ? req.user._id : null }
            ]
        };

        // ถ้าผู้ใช้เป็น Admin ให้ดูได้ทุกห้องในหมวดนั้น
        if (req.user && (req.user.role === 'admin' || req.user.role === 'evaluator')) {
            delete query.$or;
        }

        const rooms = await Area.find(query);
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลห้อง', error: error.message });
    }
};