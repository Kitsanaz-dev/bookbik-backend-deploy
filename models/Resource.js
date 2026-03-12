const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, 'Resource name is required'],
        trim: true,
        maxlength: 200,
    },
    resource_type: {
        type: String,
        enum: ['room', 'suite', 'staff', 'equipment', 'court', 'table', 'booth', 'vehicle', 'venue', 'other'],
        required: true,
    },
    description: {
        type: String,
        trim: true,
    },
    capacity: {
        type: Number,
        default: 1,
        min: 1,
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1,
    },
    image: {
        type: String,
    },
    images: [{
        type: String,
    }],
    amenities: [{
        type: String,
    }],
    bedrooms: {
        type: Number,
        default: 1,
    },
    beds: {
        type: Number,
        default: 1,
    },
    baths: {
        type: Number,
        default: 1,
    },
    host_name: {
        type: String,
        trim: true,
    },
    host_years: {
        type: Number,
        default: 1,
    },
    host_intro: {
        type: String,
        trim: true,
    },
    is_superhost: {
        type: Boolean,
        default: false,
    },
    host_avatar: {
        type: String,
    },
    host_response_rate: {
        type: Number,
        default: 100,
    },
    host_response_time: {
        type: String,
        default: 'within an hour',
    },
    host_languages: [{
        type: String,
    }],
    location_text: {
        type: String,
        trim: true,
    },
    rating: {
        type: Number,
        default: 5.0,
    },
    review_count: {
        type: Number,
        default: 0,
    },
    // Which services this resource can handle
    service_ids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
    }],
    price_override: {
        type: Number,
        default: null,
    },
    is_active: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

resourceSchema.index({ business_id: 1, is_active: 1 });

module.exports = mongoose.model('Resource', resourceSchema);
