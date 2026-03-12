const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const PosOrder = require('../models/PosOrder');
const PosProduct = require('../models/PosProduct');

// All routes require authentication
router.use(authenticate);

// POST /api/pos/orders — Create order
router.post('/', async (req, res) => {
    try {
        const { business_id, items, customerName, paymentMethod, tax, discount, notes } = req.body;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

        // Validate items and check stock
        const orderItems = [];
        const stockUpdates = [];

        for (let item of items) {
            const product = await PosProduct.findById(item.product);
            if (!product) {
                return res.status(400).json({ success: false, message: `Product not found: ${item.product}` });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
                });
            }
            orderItems.push({
                product: product._id,
                name: product.name,
                price: product.price,
                quantity: item.quantity,
                subtotal: product.price * item.quantity,
            });
            stockUpdates.push({ productId: product._id, newStock: product.stock - item.quantity });
        }

        const order = new PosOrder({
            business_id,
            customerName: customerName || 'Walk-in Customer',
            items: orderItems,
            tax: tax || 0,
            discount: discount || 0,
            paymentMethod,
            notes,
            created_by: req.user._id,
        });

        const savedOrder = await order.save();

        // Update stock
        for (let update of stockUpdates) {
            await PosProduct.findByIdAndUpdate(update.productId, { stock: update.newStock });
        }

        res.status(201).json({ success: true, message: 'Order created successfully', data: savedOrder });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating order', error: error.message });
    }
});

// GET /api/pos/orders?business_id=xxx
router.get('/', async (req, res) => {
    try {
        const { business_id, status, startDate, endDate, limit = 50, page = 1 } = req.query;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

        let query = { business_id };
        if (status) query.status = status;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate + 'T23:59:59');
        }

        const skip = (page - 1) * limit;
        const orders = await PosOrder.find(query)
            .populate('created_by', 'name')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        const total = await PosOrder.countDocuments(query);

        res.json({
            success: true,
            data: orders,
            pagination: {
                current: parseInt(page),
                total: Math.ceil(total / limit),
                count: orders.length,
                totalOrders: total,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching orders', error: error.message });
    }
});

// GET /api/pos/orders/:id
router.get('/:id', async (req, res) => {
    try {
        const order = await PosOrder.findById(req.params.id).populate('created_by', 'name');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching order', error: error.message });
    }
});

// PATCH /api/pos/orders/:id/status
router.patch('/:id/status', async (req, res) => {
    try {
        const { status, paymentStatus } = req.body;
        const update = {};
        if (status) update.status = status;
        if (paymentStatus) update.paymentStatus = paymentStatus;

        const order = await PosOrder.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, message: 'Order updated successfully', data: order });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating order', error: error.message });
    }
});

// GET /api/pos/orders/stats/overview?business_id=xxx&period=30
router.get('/stats/overview', async (req, res) => {
    try {
        const { business_id, period = '30' } = req.query;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

        const days = parseInt(period);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const totalOrders = await PosOrder.countDocuments({
            business_id,
            createdAt: { $gte: startDate },
            status: { $ne: 'cancelled' },
        });

        const revenueData = await PosOrder.aggregate([
            { $match: { business_id: require('mongoose').Types.ObjectId(business_id), createdAt: { $gte: startDate }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, totalRevenue: { $sum: '$total' } } },
        ]);

        const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
        const totalProducts = await PosProduct.countDocuments({ business_id, isActive: true });
        const lowStockProducts = await PosProduct.countDocuments({ business_id, stock: { $lte: 10 }, isActive: true });
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Daily revenue
        const dailyRevenue = await PosOrder.aggregate([
            { $match: { business_id: require('mongoose').Types.ObjectId(business_id), createdAt: { $gte: startDate }, status: { $ne: 'cancelled' } } },
            {
                $group: {
                    _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
                    revenue: { $sum: '$total' },
                    orders: { $sum: 1 },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        // Top products
        const topProducts = await PosOrder.aggregate([
            { $match: { business_id: require('mongoose').Types.ObjectId(business_id), createdAt: { $gte: startDate }, status: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.product',
                    name: { $first: '$items.name' },
                    totalQuantitySold: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.subtotal' },
                    orderCount: { $sum: 1 },
                },
            },
            { $sort: { totalQuantitySold: -1 } },
            { $limit: 5 },
        ]);

        res.json({
            success: true,
            data: {
                overview: {
                    totalOrders,
                    totalRevenue: Math.round(totalRevenue * 100) / 100,
                    totalProducts,
                    lowStockProducts,
                    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
                },
                dailyRevenue,
                topProducts,
                period: `${days} days`,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching stats', error: error.message });
    }
});

module.exports = router;
