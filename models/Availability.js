const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
    resource_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource',
        required: true,
        index: true,
    },
    day_of_week: {
        type: Number, // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        required: true,
        min: 0,
        max: 6,
    },
    start_time: {
        type: String, // "08:00" format (HH:mm)
        required: true,
    },
    end_time: {
        type: String, // "22:00" format (HH:mm)
        required: true,
    },
    is_available: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

// Compound index for fast lookups
availabilitySchema.index({ resource_id: 1, day_of_week: 1 });

module.exports = mongoose.model('Availability', availabilitySchema);
