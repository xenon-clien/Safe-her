const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    contactName: {
        type: String,
        required: true
    },
    contactPhone: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);
