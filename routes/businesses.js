const express = require('express');
const Business = require('../models/Business');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/businesses — Public: list active businesses, Admin: list ALL
router.get('/', async (req, res) => {
    try {
        const { type, search, page = 1, limit = 20 } = req.query;
        const filter = {};

        // Check if the caller is an authenticated admin
        // If not admin (or not authenticated), only show active businesses
        let isAdmin = false;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
                if (decoded.role === 'admin') isAdmin = true;
            } catch (e) { /* not authenticated or invalid token, treat as public */ }
        }

        if (!isAdmin) {
            filter.status = 'active'; // Public users only see active businesses
        }

        if (type) filter.business_type = type;
        if (search) filter.business_name = { $regex: search, $options: 'i' };

        const businesses = await Business.find(filter)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ createdAt: -1 });

        const total = await Business.countDocuments(filter);

        res.json({ success: true, data: businesses, total, page: Number(page), limit: Number(limit) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/businesses/:id — Public: get single business
router.get('/:id', async (req, res) => {
    try {
        const business = await Business.findById(req.params.id);
        if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });
        res.json({ success: true, data: business });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/businesses — Owner: create business
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const business = await Business.create({
            ...req.body,
            owner_id: req.user._id,
        });

        // Link user to business
        await User.findByIdAndUpdate(req.user._id, { business_id: business._id });

        res.status(201).json({ success: true, data: business });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/businesses/:id — Owner: update business
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const business = await Business.findById(req.params.id);
        if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

        // Only owner of this business or admin can update
        if (req.user.role !== 'admin' && business.owner_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        const updated = await Business.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        res.json({ success: true, data: updated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/businesses/:id/status — Admin: approve/suspend business
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!['pending', 'active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }

        const business = await Business.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found.' });

        res.json({ success: true, data: business });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
