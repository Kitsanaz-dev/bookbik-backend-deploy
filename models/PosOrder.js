const mongoose = require('mongoose');

const posOrderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PosProduct',
        required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true },
}, { _id: true });

const posOrderSchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
    },
    orderNumber: {
        type: String,
    },
    customerName: {
        type: String,
        default: 'Walk-in Customer',
    },
    items: [posOrderItemSchema],
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'cancelled'],
        default: 'pending',
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'mobile', 'digital', 'bank_transfer'],
        required: true,
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'refunded'],
        default: 'pending',
    },
    notes: {
        type: String,
        maxlength: 500,
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});

// Generate order number per business
posOrderSchema.pre('save', async function (next) {
    if (this.isNew) {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const count = await this.constructor.countDocuments({
            business_id: this.business_id,
            createdAt: {
                $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
                $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
            },
        });
        this.orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(3, '0')}`;
    }
    next();
});

// Calculate totals before saving
posOrderSchema.pre('save', function () {
    if (this.items && this.items.length > 0) {
        this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
        this.total = this.subtotal + this.tax - this.discount;
    }
});

posOrderSchema.index({ business_id: 1, createdAt: -1 });

module.exports = mongoose.model('PosOrder', posOrderSchema);
