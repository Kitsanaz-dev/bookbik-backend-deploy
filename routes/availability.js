const express = require('express');
const Availability = require('../models/Availability');
const Resource = require('../models/Resource');
const Booking = require('../models/Booking');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/availability/check-dates — Client: check room availability for date range
router.get('/check-dates', async (req, res) => {
    try {
        const { service_id, start_date, end_date } = req.query;
        if (!service_id || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'service_id, start_date, and end_date are required.' });
        }

        const start = new Date(start_date);
        const end = new Date(end_date);

        // 1. Find all resources linked to this service
        const resources = await Resource.find({ service_ids: service_id, is_active: true });
        const resourceIds = resources.map(r => r._id);

        // 2. Find overlapping bookings for these resources
        const overlappingBookings = await Booking.find({
            resource_id: { $in: resourceIds },
            status: { $in: ['pending', 'confirmed'] },
            start_datetime: { $lt: end },
            end_datetime: { $gt: start }
        });

        // 3. For each resource, calculate max concurrent bookings per day
        const availabilityData = resources.map(resource => {
            const resourceBookings = overlappingBookings.filter(b => b.resource_id.toString() === resource._id.toString());

            let maxConcurrent = 0;
            // Iterate day by day in the range (check at noon to avoid boundary issues)
            for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
                const checkTime = new Date(d);
                checkTime.setHours(12, 0, 0, 0);

                const count = resourceBookings
                    .filter(b => b.start_datetime <= checkTime && b.end_datetime > checkTime)
                    .reduce((sum, b) => sum + (b.quantity || 1), 0);

                if (count > maxConcurrent) maxConcurrent = count;
            }

            const totalQty = resource.quantity || 1;
            const availableQty = Math.max(0, totalQty - maxConcurrent);

            return {
                resource_id: resource._id,
                name: resource.name,
                capacity: resource.capacity,
                total_quantity: totalQty,
                available_quantity: availableQty,
                description: resource.description,
                image: resource.image,
                price_override: resource.price_override
            };
        });

        // Optional: Filter out resources that have 0 availability?
        // Let's return all and let frontend disable the "Book" button if 0.
        res.json({ success: true, data: availabilityData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/availability?resource_id=xxx
router.get('/', async (req, res) => {
    try {
        const { resource_id } = req.query;
        if (!resource_id) return res.status(400).json({ success: false, message: 'resource_id is required.' });

        const slots = await Availability.find({ resource_id }).sort({ day_of_week: 1, start_time: 1 });
        res.json({ success: true, data: slots });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/availability — Owner: set availability for a resource
router.post('/', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const slot = await Availability.create(req.body);
        res.status(201).json({ success: true, data: slot });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/availability/bulk — Owner: set weekly schedule at once
router.post('/bulk', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        const { resource_id, schedule } = req.body;
        // schedule = [{ day_of_week, start_time, end_time, is_available }]

        // Clear existing schedule for this resource
        await Availability.deleteMany({ resource_id });

        // Insert new schedule
        const docs = schedule.map(s => ({ resource_id, ...s }));
        const slots = await Availability.insertMany(docs);

        res.status(201).json({ success: true, data: slots });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/availability/:id
router.delete('/:id', authenticate, authorize('owner', 'admin'), async (req, res) => {
    try {
        await Availability.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Availability slot deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
