const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: 100,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false, // Never return password by default
    },
    phone: {
        type: String,
        trim: true,
    },
    role: {
        type: String,
        enum: ['admin', 'owner', 'staff', 'customer'],
        default: 'customer',
    },
    business_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Business',
        default: null, // null for customers and platform admins
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    is_verified: {
        type: Boolean,
        default: false,
    },
    favorite_services: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    }],
    favorite_resources: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource'
    }],
}, {
    timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
