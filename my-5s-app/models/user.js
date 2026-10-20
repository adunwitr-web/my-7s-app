const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    role: {
        type: String,
        enum: [
            'Admin', 
            'Internal Assessor', 
            'External Assessor', 
            'Area Owner',
            'Internal Assessor & Area Owner',
            'External Assessor & Area Owner'
        ],
        required: true
    },

    assignedArea: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Area',
        default: null
    },

    firstName: { type: String, required: true },
    lastName: { type: String, default: '' },
    fullName: { type: String, default: '' },
    email: { type: String, required: true },

    position: { type: String, default: '' },
    affiliation: { type: String, default: '' },
    expertise: { type: String, default: '' },
    contactInfo: { type: String, default: '' },

    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);