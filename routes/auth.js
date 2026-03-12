const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered.' });
        }

        // Only allow customer registration from public. Admin creates owners.
        const allowedRole = (role === 'owner' || role === 'customer') ? role : 'customer';

        const user = await User.create({
            name,
            email,
            password,
            phone,
            role: allowedRole,
        });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                favorite_services: user.favorite_services || [],
                favorite_resources: user.favorite_resources || [],
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        if (!user.is_active) {
            return res.status(403).json({ success: false, message: 'Account is disabled.' });
        }

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // If owner/staff, fetch their business info for the frontend
        let businessStatus = null;
        let businessFeatures = null;
        if ((user.role === 'owner' || user.role === 'staff') && user.business_id) {
            const Business = require('../models/Business');
            const biz = await Business.findById(user.business_id);
            if (biz) {
                businessStatus = biz.status;
                businessFeatures = biz.features;
            }
        }

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                business_id: user.business_id,
                business_status: businessStatus,
                features: businessFeatures,
                favorite_services: user.favorite_services || [],
                favorite_resources: user.favorite_resources || [],
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
    // If owner/staff, fetch their business info
    let businessStatus = null;
    let businessFeatures = null;
    if ((req.user.role === 'owner' || req.user.role === 'staff') && req.user.business_id) {
        const Business = require('../models/Business');
        const biz = await Business.findById(req.user.business_id);
        if (biz) {
            businessStatus = biz.status;
            businessFeatures = biz.features;
        }
    }

    res.json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            business_id: req.user.business_id,
            business_status: businessStatus,
            features: businessFeatures,
            favorite_services: req.user.favorite_services || [],
            favorite_resources: req.user.favorite_resources || [],
        },
    });
});

module.exports = router;
