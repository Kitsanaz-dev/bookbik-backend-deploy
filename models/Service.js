const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, 'Service name is required'],
        trim: true,
        maxlength: 200,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    duration_minutes: {
        type: Number,
        required: true,
        min: 1,
        default: 60,
    },
    price: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        default: 'LAK',
    },
    buffer_time: {
        type: Number, // minutes between bookings
        default: 0,
    },
    booking_type: {
        type: String,
        enum: ['time_slot', 'date_range', 'quantity_based'],
        required: true,
        default: 'time_slot',
    },
    max_quantity: {
        type: Number, // only for quantity_based
        default: 1,
    },
    available_days: {
        type: [Number], // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
        default: [0, 1, 2, 3, 4, 5, 6], // All days by default
    },
    open_time: {
        type: String, // "09:00" format
        default: '09:00',
    },
    close_time: {
        type: String, // "17:00" format
        default: '17:00',
    },
    break_start: {
        type: String, // "12:00" format, optional
        default: null,
    },
    break_end: {
        type: String, // "13:00" format, optional
        default: null,
    },
    slot_mode: {
        type: String,
        enum: ['auto', 'manual'],
        default: 'auto',
    },
    custom_slots: [{
        start: { type: String, required: true }, // "09:00"
        end: { type: String, required: true },   // "10:00"
    }],
    is_active: {
        type: Boolean,
        default: true,
    },
    max_duration: {
        type: Number,
        default: 0, // 0 for unlimited
    },
    duration_unit: {
        type: String,
        enum: ['hour', 'day'],
        default: 'hour',
    },
    location: {
        type: String,
        trim: true,
        maxlength: 300,
        default: '',
    },
    province: {
        type: String,
        trim: true,
        default: '',
    },
    district: {
        type: String,
        trim: true,
        default: '',
    },
    village: {
        type: String,
        trim: true,
        default: '',
    },
    latitude: {
        type: Number,
        default: null,
    },
    longitude: {
        type: Number,
        default: null,
    },
    image: {
        type: String, // URL/path to optimized image
        trim: true,
        default: null,
    },
    category: {
        type: String,
        trim: true,
        default: 'General',
        index: true,
    },
    difficulty: {
        type: String,
        enum: ['easy', 'moderate', 'hard', 'any'],
        default: 'any',
    },
    slot_type: {
        type: String,
        enum: ['full', 'half', 'person', 'any'],
        default: 'any',
    },
    amenities: {
        type: [String],
        default: [],
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Virtual for resources that belong to this service
serviceSchema.virtual('resources', {
    ref: 'Resource',
    localField: '_id',
    foreignField: 'service_ids',
});

// Always filter by business_id
serviceSchema.index({ business_id: 1, is_active: 1 });

module.exports = mongoose.model('Service', serviceSchema);
