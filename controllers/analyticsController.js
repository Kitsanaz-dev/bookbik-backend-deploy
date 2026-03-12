const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const PosOrder = require('../models/PosOrder');

// Utility to get date ranges based on query parameter
const getDateRange = (rangeType) => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (rangeType === 'today') {
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
    } else if (rangeType === 'week') {
        startDate.setDate(now.getDate() - 7);
    } else if (rangeType === 'month') {
        startDate.setMonth(now.getMonth() - 1);
    } else if (rangeType === 'year') {
        startDate.setFullYear(now.getFullYear() - 1);
    } else {
        // default to last 30 days
        startDate.setDate(now.getDate() - 30);
    }
    return { startDate, endDate };
};

// GET /api/analytics/kpi
const getKPIs = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services'; // 'services' or 'pos'
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        // Common match conditions
        const matchStage = {
            business_id: businessId,
            start_datetime: { $gte: startDate, $lte: endDate }
        };
        if (serviceId) {
            matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
        }

        let totalRevenue = 0, averageValue = 0, totalBookings = 0, cancelledBookings = 0;

        if (type === 'pos') {
            // ... POS logic exists below ...
            const revenueResult = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate },
                        status: { $in: ['completed', 'processing'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$total' },
                        averageValue: { $avg: '$total' }
                    }
                }
            ]);

            const bookingsResult = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalBookings: { $sum: 1 },
                        cancelledBookings: {
                            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                        }
                    }
                }
            ]);

            totalRevenue = revenueResult[0]?.totalRevenue || 0;
            averageValue = revenueResult[0]?.averageValue || 0;
            totalBookings = bookingsResult[0]?.totalBookings || 0;
            cancelledBookings = bookingsResult[0]?.cancelledBookings || 0;

        } else {
            // Original Booking logic
            const revenueResult = await Booking.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        start_datetime: { $gte: startDate, $lte: endDate },
                        status: { $in: ['completed', 'checked_in', 'confirmed'] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$total_price' },
                        averageValue: { $avg: '$total_price' }
                    }
                }
            ]);

            const bookingsResult = await Booking.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        start_datetime: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalBookings: { $sum: 1 },
                        cancelledBookings: {
                            $sum: { $cond: [{ $in: ['$status', ['cancelled', 'no_show']] }, 1, 0] }
                        }
                    }
                }
            ]);

            totalRevenue = revenueResult[0]?.totalRevenue || 0;
            averageValue = revenueResult[0]?.averageValue || 0;
            totalBookings = bookingsResult[0]?.totalBookings || 0;
            cancelledBookings = bookingsResult[0]?.cancelledBookings || 0;
        }

        const cancellationRate = totalBookings > 0 ? ((cancelledBookings / totalBookings) * 100).toFixed(1) : 0;

        res.json({
            success: true,
            data: {
                totalRevenue,
                averageValue,
                totalBookings,
                cancellationRate: `${cancellationRate}%`
            }
        });
    } catch (error) {
        console.error('getKPIs Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch KPIs' });
    }
};

// GET /api/analytics/revenue
const getRevenue = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services';
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        let revenueByDate;

        if (type === 'pos') {
            revenueByDate = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate },
                        status: { $in: ['completed', 'processing'] }
                    }
                },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        revenue: { $sum: "$total" }
                    }
                },
                { $sort: { _id: 1 } }
            ]);
        } else {
            const matchStage = {
                business_id: businessId,
                start_datetime: { $gte: startDate, $lte: endDate },
                status: { $in: ['completed', 'checked_in', 'confirmed'] }
            };
            if (serviceId) {
                matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
            }

            revenueByDate = await Booking.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$start_datetime" } },
                        revenue: { $sum: "$total_price" }
                    }
                },
                { $sort: { _id: 1 } }
            ]);
        }

        res.json({ success: true, data: revenueByDate.map(i => ({ date: i._id, revenue: i.revenue })) });
    } catch (error) {
        console.error('getRevenue Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch revenue' });
    }
};

// GET /api/analytics/sources
const getSources = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services';
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        let sourceStats;

        if (type === 'pos') {
            sourceStats = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: "$paymentMethod",
                        count: { $sum: 1 },
                        revenue: {
                            $sum: { $cond: [{ $in: ['$status', ['completed', 'processing']] }, "$total", 0] }
                        }
                    }
                }
            ]);
        } else {
            const matchStage = {
                business_id: businessId,
                start_datetime: { $gte: startDate, $lte: endDate }
            };
            if (serviceId) {
                matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
            }

            sourceStats = await Booking.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: { $cond: [{ $ifNull: ["$customer_id", false] }, "Online", "Walk-in"] },
                        count: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $cond: [{ $in: ['$status', ['completed', 'checked_in', 'confirmed']] }, "$total_price", 0]
                            }
                        }
                    }
                }
            ]);
        }

        res.json({
            success: true,
            data: sourceStats.map(i => ({
                name: i._id ? (i._id.charAt(0).toUpperCase() + i._id.slice(1).replace('_', ' ')) : 'Unknown',
                value: i.count,
                revenue: i.revenue
            }))
        });
    } catch (error) {
        console.error('getSources Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch booking sources' });
    }
};

// GET /api/analytics/services
const getTopServices = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services';
        const { startDate, endDate } = getDateRange(range);

        let serviceStats;

        if (type === 'pos') {
            serviceStats = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate },
                        status: { $in: ['completed', 'processing'] }
                    }
                },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: "$items.product",
                        bookings: { $sum: "$items.quantity" },
                        revenue: { $sum: "$items.subtotal" },
                        name: { $first: "$items.name" }
                    }
                },
                { $sort: { revenue: -1 } },
                { $limit: 7 }
            ]);
        } else {
            serviceStats = await Booking.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        start_datetime: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: "$service_id",
                        bookings: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $cond: [{ $in: ['$status', ['completed', 'checked_in', 'confirmed']] }, "$total_price", 0]
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: "services", // Must match collection name
                        localField: "_id",
                        foreignField: "_id",
                        as: "serviceDetails"
                    }
                },
                { $unwind: "$serviceDetails" },
                {
                    $project: {
                        _id: 1,
                        bookings: 1,
                        revenue: 1,
                        name: "$serviceDetails.name"
                    }
                },
                { $sort: { revenue: -1 } },
                { $limit: 7 }
            ]);
        }

        res.json({ success: true, data: serviceStats });
    } catch (error) {
        console.error('getTopServices Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch top services' });
    }
};

// GET /api/analytics/guest-volume
const getGuestVolume = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services';
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        if (type === 'pos') {
            // POS does not track guest quantity in the same format (item quantity is different)
            return res.json({ success: true, data: [] });
        }

        const matchStage = {
            business_id: businessId,
            start_datetime: { $gte: startDate, $lte: endDate },
            status: { $in: ['completed', 'checked_in', 'confirmed'] }
        };
        if (serviceId) {
            matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
        }

        const guestData = await Booking.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$start_datetime" } },
                    totalGuests: { $sum: "$quantity" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            data: guestData.map(d => ({
                name: d._id, // Format: YYYY-MM-DD
                value: d.totalGuests
            }))
        });
    } catch (error) {
        console.error('getGuestVolume Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch guest volume' });
    }
};

// GET /api/analytics/status-distribution
const getStatusDistribution = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const type = req.query.type || 'services';
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        let statusStats;
        let targetStatuses;

        if (type === 'pos') {
            statusStats = await PosOrder.aggregate([
                {
                    $match: {
                        business_id: businessId,
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);
            targetStatuses = ['completed', 'processing', 'cancelled', 'pending'];
        } else {
            const matchStage = {
                business_id: businessId,
                start_datetime: { $gte: startDate, $lte: endDate }
            };
            if (serviceId) {
                matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
            }

            statusStats = await Booking.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);
            targetStatuses = ['completed', 'confirmed', 'cancelled', 'postponed'];
        }

        const total = statusStats.reduce((acc, curr) => acc + curr.count, 0);

        const data = targetStatuses.map(status => {
            const stat = statusStats.find(s => s._id === status);
            const count = stat ? stat.count : 0;
            return {
                name: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
                value: count,
                percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0
            };
        });

        res.json({ success: true, data, total });
    } catch (error) {
        console.error('getStatusDistribution Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch status distribution' });
    }
};

// GET /api/analytics/peak-hours
const getPeakHours = async (req, res) => {
    try {
        const businessId = new mongoose.Types.ObjectId(req.user.business_id);
        const range = req.query.range || 'month';
        const serviceId = req.query.serviceId;
        const { startDate, endDate } = getDateRange(range);

        const matchStage = {
            business_id: businessId,
            start_datetime: { $gte: startDate, $lte: endDate },
            status: { $nin: ['cancelled', 'no_show'] }
        };
        if (serviceId) {
            matchStage.service_id = new mongoose.Types.ObjectId(serviceId);
        }

        const peakHours = await Booking.aggregate([
            { $match: matchStage },
            {
                $project: {
                    hour: { $hour: "$start_datetime" }
                }
            },
            {
                $group: {
                    _id: "$hour",
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Fill in missing hours (0-23) for a complete chart
        const hourlyData = Array.from({ length: 24 }, (_, i) => ({
            hour: `${i}:00`,
            bookings: peakHours.find(p => p._id === i)?.count || 0
        }));

        res.json({ success: true, data: hourlyData });
    } catch (error) {
        console.error('getPeakHours Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch peak hours' });
    }
};

module.exports = {
    getKPIs,
    getRevenue,
    getSources,
    getTopServices,
    getGuestVolume,
    getPeakHours,
    getStatusDistribution
};
