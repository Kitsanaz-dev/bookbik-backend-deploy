const mongoose = require('mongoose');

const posProductSchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
    },
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
        maxlength: 100,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: 0,
    },
    stock: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PosCategory',
        default: null,
    },
    barcode: {
        type: String,
        sparse: true,
    },
    image: {
        type: String,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

posProductSchema.index({ business_id: 1, name: 'text', description: 'text' });
posProductSchema.index({ business_id: 1, barcode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PosProduct', posProductSchema);
