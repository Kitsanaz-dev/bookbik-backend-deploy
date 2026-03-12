const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
        index: true,
    },
    service_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service',
        required: true,
    },
    resource_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource',
        default: null, // Optional — not all services require a resource
    },
    customer_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null, // null for walk-in bookings
    },
    customer_name: {
        type: String,
        trim: true,
        maxlength: 200,
        default: 'Walk-in',
    },
    quantity: {
        type: Number,
        default: 1,
        min: 1,
    },
    start_datetime: {
        type: Date,
        required: true,
    },
    end_datetime: {
        type: Date,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'checked_in', 'cancelled', 'completed', 'no_show', 'postponed'],
        default: 'pending',
    },
    total_price: {
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
        enum: ['at_venue', 'partial', 'full', 'half', 'online'],
        default: 'at_venue',
    },
    guest_details: {
        date_of_birth: Date,
        gender: { type: String, enum: ['Male', 'Female', 'Other', ''] },
        nationality: String,
        passport_id_number: String,
        passport_issue_date: Date,
        passport_expiry_date: Date,
        visa_type: String,
        visa_expiry_date: Date,
        date_of_entry: Date,
        previous_destination: String,
        next_destination: String,
        home_address: String,
        phone_whatsapp: String,
        emergency_contact_name: String,
        emergency_contact_phone: String,
        vehicle_plate_number: String,
        company_name: String,
        tax_id: String
    },
    payment_status: {
        type: String,
        enum: ['unpaid', 'partial', 'paid', 'refund_pending', 'refunded'],
        default: 'unpaid',
    },
    amount_paid: {
        type: Number,
        default: 0,
    },
    cancellation_fee: {
        type: Number,
        default: 0,
        min: 0,
    },
    postpone_count: {
        type: Number,
        default: 0,
        min: 0,
        max: 2,
    },
    refund_proof_image: {
        type: String,
        default: null,
    },
    customer_bank_qr_image: {
        type: String,
        default: null,
    },
    notes: {
        type: String,
        trim: true,
        maxlength: 1000,
    },
    verification_code: {
        type: String,
        unique: true,
        sparse: true,
    },
    is_verified: {
        type: Boolean,
        default: false,
    },
    group_id: {
        type: String,
        index: true,
    },
    verified_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
}, {
    timestamps: true,
});

// Auto-generate verification code before save
bookingSchema.pre('save', function () {
    if (!this.verification_code) {
        this.verification_code = require('crypto').randomBytes(4).toString('hex').toUpperCase();
    }
});

// Prevent double-booking: compound index for overlap queries
bookingSchema.index({ resource_id: 1, start_datetime: 1, end_datetime: 1 });
bookingSchema.index({ business_id: 1, status: 1 });
bookingSchema.index({ customer_id: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
