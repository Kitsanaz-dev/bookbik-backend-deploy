const express = require('express');
const User = require('../models/User');
const { authenticate, authorize, tenantGuard } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   POST /api/staff
 * @desc    Owner: Create a new staff account for their business
 * @access  Private (Owner only)
 */
router.post('/', authenticate, authorize('owner'), async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        // Create the staff user, automatically assigning the owner's business_id
        const user = await User.create({
            name,
            email,
            password,
            phone,
            role: 'staff',
            business_id: req.user.business_id, // Link to the same business as the owner
            is_active: true,
            is_verified: true, // Auto-verified since it's created by the owner
        });

        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                business_id: user.business_id
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/staff
 * @desc    Owner: List all staff for their business
 * @access  Private (Owner only)
 */
router.get('/', authenticate, authorize('owner'), tenantGuard, async (req, res) => {
    try {
        const staff = await User.find({
            business_id: req.user.business_id,
            role: 'staff' // Ensure we only get staff, not the owner themselves
        })
            .select('-password')
            .sort({ createdAt: -1 });

        // Get performance metrics for each staff
        const Booking = require('../models/Booking');
        const staffWithMetrics = await Promise.all(staff.map(async (u) => {
            const bookingsCount = await Booking.countDocuments({
                verified_by: u._id,
                status: 'completed'
            });
            return {
                ...u.toObject(),
                bookingsHandled: bookingsCount
            };
        }));

        res.json({ success: true, data: staffWithMetrics });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   PATCH /api/staff/:id/status
 * @desc    Owner: Activate/Deactivate staff account
 * @access  Private (Owner only)
 */
router.patch('/:id/status', authenticate, authorize('owner'), tenantGuard, async (req, res) => {
    try {
        const { is_active } = req.body;

        // Ensure the staff member belongs to the owner's business
        const user = await User.findOneAndUpdate(
            { _id: req.params.id, business_id: req.user.business_id, role: 'staff' },
            { is_active },
            { new: true }
        ).select('-password');

        if (!user) return res.status(404).json({ success: false, message: 'Staff member not found.' });

        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   DELETE /api/staff/:id
 * @desc    Owner: Permanent delete staff account
 * @access  Private (Owner only)
 */
router.delete('/:id', authenticate, authorize('owner'), tenantGuard, async (req, res) => {
    try {
        // Ensure the staff member belongs to the owner's business
        const user = await User.findOneAndDelete({
            _id: req.params.id,
            business_id: req.user.business_id,
            role: 'staff'
        });

        if (!user) return res.status(404).json({ success: false, message: 'Staff member not found.' });

        res.json({ success: true, message: 'Staff member removed.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
