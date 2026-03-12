const express = require('express');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/users
 * @desc    Admin: Create a new user (owner or customer)
 * @access  Private (Admin only)
 */
router.post('/', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        const user = await User.create({
            name,
            email,
            password,
            phone,
            role: role || 'customer',
            is_active: true,
            is_verified: true, // Admin-created users are auto-verified
        });

        // If the user is an owner, auto-create a basic business profile for them
        if (user.role === 'owner') {
            const Business = require('../models/Business');
            const business = await Business.create({
                owner_id: user._id,
                business_name: `${user.name}'s Business`, // Default name placeholder
                business_type: 'general',
                email: user.email,
                phone: user.phone,
                status: 'active', // Auto-approved since admin created it
            });

            // Link the business back to the user
            user.business_id = business._id;
            await user.save();
        }

        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/users
 * @desc    Admin: List all users on the platform
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { role, search, page = 1, limit = 50 } = req.query;
        const filter = {};

        if (role) filter.role = role;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(filter)
            .select('-password')
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            data: users,
            total,
            page: Number(page),
            limit: Number(limit)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/users/:id
 * @desc    Admin: Get user details
 * @access  Private (Admin only)
 */
router.get('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   PATCH /api/users/:id/status
 * @desc    Admin: Activate/Deactivate user account
 * @access  Private (Admin only)
 */
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { is_active } = req.body;
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'is_active must be a boolean.' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, { is_active }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Admin: Permanent delete user
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, message: 'User deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
