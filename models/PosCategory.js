const mongoose = require('mongoose');

const posCategorySchema = new mongoose.Schema({
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        required: true,
    },
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        maxlength: 50,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    color: {
        type: String,
        default: '#007bff',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

// Unique category name per business
posCategorySchema.index({ business_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('PosCategory', posCategorySchema);
