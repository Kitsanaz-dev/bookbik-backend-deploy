const mongoose = require('mongoose');

const businessSchema = new mongoose.Schema({
    owner_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    business_name: {
        type: String,
        required: [true, 'Business name is required'],
        trim: true,
        maxlength: 200,
    },
    business_type: {
        type: String,
        enum: ['hotel', 'salon', 'clinic', 'rental', 'sport', 'restaurant', 'nightclub', 'general'],
        required: [true, 'Business type is required'],
    },
    description: {
        type: String,
        trim: true,
        maxlength: 2000,
    },
    address: {
        type: String,
        trim: true,
    },
    phone: {
        type: String,
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
    },
    image: {
        type: String, // URL to cover image
    },
    timezone: {
        type: String,
        default: 'Asia/Vientiane',
    },
    subscription_plan: {
        type: String,
        enum: ['free', 'basic', 'pro'],
        default: 'free',
    },
    features: {
        pos_enabled: { type: Boolean, default: false },
        sms_enabled: { type: Boolean, default: false },
        payment_gateway_enabled: { type: Boolean, default: false },
        staff_enabled: { type: Boolean, default: false }, // Default false for now, can be changed by admin
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'suspended'],
        default: 'pending',
    },
    payment_policy: {
        allow_pay_at_venue: { type: Boolean, default: true },
        allow_partial_pay: { type: Boolean, default: false },
        partial_pay_percentage: { type: Number, default: 10 },
        allow_full_pay: { type: Boolean, default: true },
        late_limit_minutes: { type: Number, default: 10 },
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Business', businessSchema);
