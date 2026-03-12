const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    booking_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        index: true,
    },
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 0,
    },
    currency: {
        type: String,
        default: 'LAK',
    },
    payment_method: {
        type: String,
        enum: ['cash', 'bank_transfer', 'qr_code', 'card', 'online_gateway'],
        required: true,
    },
    transaction_id: {
        type: String, // External gateway transaction ID
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refund_pending', 'refunded'],
        default: 'pending',
    },
    notes: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});

paymentSchema.index({ business_id: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
