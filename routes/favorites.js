const express = require('express');
const User = require('../models/User');
const Service = require('../models/Service');
const Resource = require('../models/Resource');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * @route   GET /api/favorites
 * @desc    Get user's favorite services and resources
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: 'favorite_services',
                populate: { path: 'business_id' }
            })
            .populate({
                path: 'favorite_resources',
                populate: {
                    path: 'service_ids',
                    populate: { path: 'business_id' }
                }
            });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Format items for the frontend ServiceCard
        const favoriteServices = (user.favorite_services || []).map(svc => ({
            svc,
            key: svc._id,
            type: 'service'
        }));

        const favoriteResources = (user.favorite_resources || []).map(res => {
            const svc = res.service_ids?.[0]; // Default to first service
            return {
                svc,
                res,
                key: svc ? `${svc._id}_${res._id}` : res._id,
                type: 'resource'
            };
        });

        res.json({
            success: true,
            data: [...favoriteServices, ...favoriteResources]
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/favorites/:id/toggle
 * @desc    Toggle service or resource in user's favorites
 * @access  Private
 */
router.post('/:id/toggle', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.body; // 'service' or 'resource'
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!type || (type !== 'service' && type !== 'resource')) {
            return res.status(400).json({ success: false, message: 'Invalid or missing type parameter. Must be "service" or "resource".' });
        }

        let isFavorited = false;

        if (type === 'resource') {
            const resource = await Resource.findById(id);
            if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

            const index = user.favorite_resources.findIndex(favId => favId.toString() === id);

            if (index > -1) {
                user.favorite_resources.splice(index, 1);
                isFavorited = false;
            } else {
                user.favorite_resources.push(id);
                isFavorited = true;
            }
        } else {
            // Default to service
            const service = await Service.findById(id);
            if (!service) return res.status(404).json({ success: false, message: 'Service not found' });

            const index = user.favorite_services.findIndex(favId => favId.toString() === id);

            if (index > -1) {
                user.favorite_services.splice(index, 1);
                isFavorited = false;
            } else {
                user.favorite_services.push(id);
                isFavorited = true;
            }
        }

        await user.save();

        res.json({
            success: true,
            message: isFavorited ? 'Added to favorites' : 'Removed from favorites',
            isFavorited,
            user: {
                id: user._id,
                favorite_services: user.favorite_services,
                favorite_resources: user.favorite_resources
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
