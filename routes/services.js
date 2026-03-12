const express = require('express');
const Service = require('../models/Service');
const { authenticate, authorize, tenantGuard } = require('../middleware/auth');

const router = express.Router();

// GET /api/services — List services (optional: filter by business_id)
router.get('/', async (req, res) => {
    try {
        const { business_id } = req.query;
        const query = { is_active: true };
        if (business_id) query.business_id = business_id;

        const services = await Service.find(query)
            .populate('business_id', 'business_name address image')
            .populate({
                path: 'resources',
                match: { is_active: true },
                select: 'name resource_type image capacity quantity price_override'
            })
            .sort({ createdAt: -1 });
        res.json({ success: true, data: services });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/services/:id
router.get('/:id', async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
        res.json({ success: true, data: service });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/services — Owner: create service
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const service = await Service.create({
            ...req.body,
            business_id: req.user.business_id,
        });
        res.status(201).json({ success: true, data: service });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/services/:id — Owner: update service
router.put('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const service = await Service.findOneAndUpdate(
            { _id: req.params.id, business_id: req.user.business_id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
        res.json({ success: true, data: service });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/services/:id — Owner: soft-delete
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const service = await Service.findOneAndUpdate(
            { _id: req.params.id, business_id: req.user.business_id },
            { is_active: false },
            { new: true }
        );
        if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
        res.json({ success: true, message: 'Service deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
