const express = require('express');
const Resource = require('../models/Resource');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/resources?business_id=xxx
router.get('/', async (req, res) => {
    try {
        const { business_id } = req.query;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required.' });

        const resources = await Resource.find({ business_id, is_active: true })
            .populate('service_ids', 'name booking_type')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: resources });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/resources/:id
router.get('/:id', async (req, res) => {
    try {
        const resource = await Resource.findById(req.params.id)
            .populate('service_ids', 'name booking_type price currency')
            .populate('business_id', 'business_name business_type address phone district province image images');
        if (!resource) return res.status(404).json({ success: false, message: 'Resource not found.' });
        res.json({ success: true, data: resource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/resources
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const resource = await Resource.create({
            ...req.body,
            business_id: req.user.business_id,
        });
        res.status(201).json({ success: true, data: resource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/resources/:id
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const resource = await Resource.findOneAndUpdate(
            { _id: req.params.id, business_id: req.user.business_id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!resource) return res.status(404).json({ success: false, message: 'Resource not found.' });
        res.json({ success: true, data: resource });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/resources/:id
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const resource = await Resource.findOneAndUpdate(
            { _id: req.params.id, business_id: req.user.business_id },
            { is_active: false },
            { new: true }
        );
        if (!resource) return res.status(404).json({ success: false, message: 'Resource not found.' });
        res.json({ success: true, message: 'Resource deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
