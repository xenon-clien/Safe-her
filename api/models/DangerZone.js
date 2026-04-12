const mongoose = require('mongoose');

const DangerZoneSchema = new mongoose.Schema({
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number], // [lng, lat]
    },
    type: { type: String, enum: ['unlit_street', 'unpopulated', 'crowd_trouble', 'harassment', 'other'], default: 'other' },
    description: String,
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    intensity: { type: Number, min: 1, max: 10, default: 5 },
    isActive: { type: Boolean, default: true }
});

DangerZoneSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('DangerZone', DangerZoneSchema);
