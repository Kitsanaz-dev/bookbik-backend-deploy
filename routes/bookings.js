const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Resource = require('../models/Resource');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// POST /api/bookings — Customer: create booking (transaction-based double-booking prevention)
router.post('/', authenticate, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { business_id, service_id, resource_id, start_datetime, end_datetime, time_slots, payment_method, notes, quantity = 1 } = req.body;

        // Normalize to array of slots to support both single and multi-slot booking
        const slotsToBook = time_slots?.length > 0
            ? time_slots
            : [{ start_datetime, end_datetime }];

        if (!slotsToBook.length || !slotsToBook[0].start_datetime) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, message: 'start_datetime and end_datetime are required.' });
        }

        // 1. Get service and resource first for availability check
        const service = await Service.findById(service_id).session(session);
        if (!service) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: 'Service not found.' });
        }

        let totalQty = 1;
        let basePrice = service.price;
        if (resource_id) {
            const resource = await Resource.findById(resource_id).session(session);
            if (resource) {
                totalQty = resource.quantity || 1;
                if (resource.price_override !== null) basePrice = resource.price_override;
            }
        }

        const groupId = require('crypto').randomBytes(8).toString('hex').toUpperCase();
        const newBookings = [];

        for (const slot of slotsToBook) {
            const slotStart = new Date(slot.start_datetime);
            const slotEnd = new Date(slot.end_datetime);

            // 2. Check for overlapping bookings and sum their quantities
            const overlappingBookings = await Booking.find({
                resource_id,
                status: { $in: ['pending', 'confirmed'] },
                start_datetime: { $lt: slotEnd },
                end_datetime: { $gt: slotStart }
            }).session(session);

            const bookedQty = overlappingBookings.reduce((sum, b) => sum + (b.quantity || 1), 0);

            // Need to account for intra-request slots (if someone submits two identical slots to bypass limit)
            const intraRequestQty = newBookings
                .filter(b => b.start_datetime < slotEnd && b.end_datetime > slotStart)
                .reduce((sum, b) => sum + b.quantity, 0);

            if (bookedQty + intraRequestQty + quantity > totalQty) {
                await session.abortTransaction();
                session.endSession();
                return res.status(409).json({ success: false, message: `Conflict detected for slot at ${slotStart.toISOString()}.` });
            }

            // Calculate total price based on booking type
            let calculatedPrice = basePrice;
            if (service.booking_type === 'date_range') {
                const nights = Math.max(1, Math.ceil((slotEnd - slotStart) / (1000 * 60 * 60 * 24)));
                calculatedPrice = basePrice * nights * quantity;
            } else if (service.booking_type === 'quantity_based') {
                calculatedPrice = basePrice * quantity;
            } else {
                calculatedPrice = basePrice * quantity; // Usually 1 for time_slot
            }

            const isGateway = ['full', 'half'].includes(payment_method);

            newBookings.push({
                business_id,
                service_id,
                resource_id,
                customer_id: req.user._id,
                quantity,
                start_datetime: slotStart,
                end_datetime: slotEnd,
                total_price: calculatedPrice,
                currency: service.currency,
                payment_method: payment_method || 'full',
                payment_status: isGateway ? 'unpaid' : (payment_method === 'at_venue' ? 'unpaid' : 'paid'),
                amount_paid: isGateway ? 0 : calculatedPrice,
                status: isGateway ? 'pending' : 'confirmed',
                notes,
                group_id: groupId,
            });
        }

        const createdBookings = await Booking.create(newBookings, { session, ordered: true });

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ success: true, data: createdBookings });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        // Retry hint for write conflicts (TransientTransactionError)
        if (error.hasErrorLabel?.('TransientTransactionError')) {
            return res.status(409).json({ success: false, message: 'Booking conflict, please try again.' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bookings/walkin — Owner: create walk-in booking (no customer account needed)
router.post('/walkin', authenticate, authorize('owner', 'staff', 'admin'), async (req, res) => {
    try {
        const {
            business_id, service_id, resource_id,
            start_datetime, end_datetime,
            customer_name, quantity = 1,
            payment_method = 'at_venue', notes
        } = req.body;

        if (!business_id || !service_id || !start_datetime || !end_datetime) {
            return res.status(400).json({ success: false, message: 'business_id, service_id, start_datetime, and end_datetime are required.' });
        }

        const service = await Service.findById(service_id);
        if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });

        let basePrice = service.price;
        let totalQty = 1;
        if (resource_id) {
            const resource = await Resource.findById(resource_id);
            if (resource) {
                totalQty = resource.quantity || 1;
                if (resource.price_override !== null && resource.price_override !== undefined) basePrice = resource.price_override;
            }
        }

        const slotStart = new Date(start_datetime);
        const slotEnd = new Date(end_datetime);

        // Check availability
        if (resource_id) {
            const overlapping = await Booking.find({
                resource_id,
                status: { $in: ['pending', 'confirmed'] },
                start_datetime: { $lt: slotEnd },
                end_datetime: { $gt: slotStart },
            });
            const bookedQty = overlapping.reduce((sum, b) => sum + (b.quantity || 1), 0);
            const remainingQty = totalQty - bookedQty;
            if (bookedQty + quantity > totalQty) {
                const unitName = service.booking_type === 'date_range' ? 'room(s)' : 'slot(s)';
                return res.status(409).json({
                    success: false,
                    message: `Not available — ${remainingQty <= 0 ? 'fully booked' : `only ${remainingQty} ${unitName} available`} for the selected ${service.booking_type === 'date_range' ? 'dates' : 'time'}. You requested ${quantity}.`
                });
            }
        }

        // Calculate price based on booking type
        let calculatedPrice = basePrice;
        if (service.booking_type === 'date_range') {
            const nights = Math.max(1, Math.ceil((slotEnd - slotStart) / (1000 * 60 * 60 * 24)));
            calculatedPrice = basePrice * nights * quantity;
        } else if (service.booking_type === 'time_slot') {
            const hours = Math.max(1, Math.ceil((slotEnd - slotStart) / (1000 * 60 * 60)));
            calculatedPrice = basePrice * hours * quantity;
        } else {
            calculatedPrice = basePrice * quantity;
        }

        // full/half: stay pending+unpaid until gateway confirms payment
        // at_venue: confirmed immediately (pay at venue)
        const isGatewayPayment = ['full', 'half'].includes(payment_method);

        const booking = new Booking({
            business_id,
            service_id,
            resource_id: resource_id || null,
            customer_id: null,
            customer_name: customer_name || 'Walk-in',
            quantity,
            start_datetime: slotStart,
            end_datetime: slotEnd,
            total_price: calculatedPrice,
            currency: service.currency,
            payment_method,
            payment_status: isGatewayPayment ? 'unpaid' : (payment_method === 'at_venue' ? 'unpaid' : 'paid'),
            amount_paid: isGatewayPayment ? 0 : (payment_method === 'at_venue' ? 0 : calculatedPrice),
            status: isGatewayPayment ? 'pending' : 'confirmed',
            notes,
            verified_by: req.user.role === 'customer' ? null : req.user._id,
        });

        const saved = await booking.save();

        const populated = await Booking.findById(saved._id)
            .populate('service_id', 'name price booking_type')
            .populate('resource_id', 'name resource_type');

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bookings — Owner: list bookings for their business
router.get('/', authenticate, async (req, res) => {
    try {
        const { business_id, status, group_id, start_date, end_date, page = 1, limit = 20 } = req.query;
        const filter = {};

        // Customer sees their own bookings
        if (req.user.role === 'customer') {
            filter.customer_id = req.user._id;
        } else if (req.user.role === 'owner' || req.user.role === 'staff') {
            filter.business_id = req.user.business_id;
        } else if (req.user.role === 'admin' && business_id) {
            filter.business_id = business_id;
        }

        if (status) filter.status = status;
        if (group_id) filter.group_id = group_id;

        // Date range filtering
        if (start_date || end_date) {
            filter.start_datetime = {};
            if (start_date) filter.start_datetime.$gte = new Date(start_date);
            if (end_date) filter.start_datetime.$lte = new Date(end_date);
        }

        const bookings = await Booking.find(filter)
            .populate('service_id', 'name price booking_type')
            .populate('resource_id', 'name resource_type')
            .populate('customer_id', 'name email phone')
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ start_datetime: -1 });

        const total = await Booking.countDocuments(filter);

        res.json({ success: true, data: bookings, total, page: Number(page), limit: Number(limit) });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bookings/check-availability — Public: check slot availability
// MUST be before /:id to avoid Express matching 'check-availability' as an :id
router.get('/check-availability', async (req, res) => {
    try {
        const { resource_id, service_id, date } = req.query;
        if (!date || (!resource_id && !service_id)) {
            return res.status(400).json({ success: false, message: 'date and either resource_id or service_id are required.' });
        }

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        let query = {
            status: { $in: ['pending', 'confirmed'] },
            start_datetime: { $lt: dayEnd },
            end_datetime: { $gt: dayStart },
        };

        if (resource_id) {
            query.resource_id = resource_id;
        } else if (service_id) {
            // Find all resources for this service
            const resources = await Resource.find({ service_ids: service_id, is_active: true });
            const resourceIds = resources.map(r => r._id);
            query.resource_id = { $in: resourceIds };
        }

        const bookedSlots = await Booking.find(query).select('start_datetime end_datetime quantity resource_id');

        res.json({ success: true, data: bookedSlots });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bookings/resource-calendar — Public: get all bookings for a resource (minimal data for calendar)
router.get('/resource-calendar', async (req, res) => {
    try {
        const { resource_id } = req.query;
        if (!resource_id) {
            return res.status(400).json({ success: false, message: 'resource_id is required.' });
        }

        const bookings = await Booking.find({
            resource_id,
            status: { $in: ['pending', 'confirmed'] }
        })
            .select('start_datetime end_datetime quantity');

        res.json({ success: true, data: bookings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bookings/:id
router.get('/:id', authenticate, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('service_id', 'name price booking_type')
            .populate('resource_id', 'name resource_type')
            .populate('customer_id', 'name email phone');
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

        // Add Group Summary if applicable
        let group_total = booking.total_price;
        let group_amount_paid = booking.amount_paid || 0;
        let sessions_count = 1;
        let group_payment_status = booking.payment_status;

        if (booking.group_id) {
            const groupBookings = await Booking.find({ group_id: booking.group_id });
            group_total = groupBookings.reduce((sum, b) => sum + (b.total_price || 0), 0);
            group_amount_paid = groupBookings.reduce((sum, b) => sum + (b.amount_paid || 0), 0);
            sessions_count = groupBookings.length;

            // If all are paid, group is paid. If any unpaid, group is unpaid.
            const allPaid = groupBookings.every(b => b.payment_status === 'paid');
            group_payment_status = allPaid ? 'paid' : 'unpaid';
        }

        const enrichedData = {
            ...booking.toObject(),
            group_total,
            group_amount_paid,
            group_payment_status,
            sessions_count
        };

        res.json({ success: true, data: enrichedData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PATCH /api/bookings/:id/status — Owner: confirm/cancel/complete booking
router.patch('/:id/status', authenticate, authorize('owner', 'staff', 'admin'), async (req, res) => {
    try {
        const { status, refund_proof_image } = req.body;
        if (!['confirmed', 'cancelled', 'completed', 'no_show', 'refund_completed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status.' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

        let targetBookings = [];
        if (booking.group_id) {
            targetBookings = await Booking.find({ group_id: booking.group_id });
        } else {
            const bDatePrefix = booking.start_datetime.toISOString().split('T')[0];
            const startOfDay = new Date(bDatePrefix);
            const endOfDay = new Date(startOfDay);
            endOfDay.setDate(endOfDay.getDate() + 1);

            targetBookings = await Booking.find({
                customer_id: booking.customer_id,
                service_id: booking.service_id,
                resource_id: booking.resource_id,
                status: booking.status,
                start_datetime: { $gte: startOfDay, $lt: endOfDay }
            });
            if (targetBookings.length === 0) targetBookings = [booking];
        }

        if (status === 'refund_completed') {
            if (booking.payment_status !== 'refund_pending') {
                return res.status(400).json({ success: false, message: 'Booking is not pending a refund.' });
            }

            for (const b of targetBookings) {
                b.payment_status = 'refunded';
                if (refund_proof_image) b.refund_proof_image = refund_proof_image;

                const now = new Date();
                const formatNotesDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                b.notes = (b.notes ? b.notes + '\n' : '') + `Refund processed and completed by ${req.user.name || 'Owner'} on ${formatNotesDate(now)}.`;
                await b.save();
            }

            const Payment = require('../models/Payment');
            await Payment.updateMany(
                { booking_id: { $in: targetBookings.map(t => t._id) }, status: 'refund_pending' },
                { $set: { status: 'refunded' } }
            );
        } else if (status === 'cancelled') {
            // Owner cancel logic - if paid, it needs a refund
            let totalPaid = 0;
            targetBookings.forEach(b => {
                if (b.payment_status === 'paid' && b.amount_paid > 0) totalPaid += b.amount_paid;
            });

            const now = new Date();
            const formatNotesDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            // For owner cancellations, NO CANCELLATION FEE is applied! The user gets 100% back.
            const cancelNote = `Cancelled by Owner/Admin on ${formatNotesDate(now)}.` +
                (totalPaid > 0 ? ` 100% Refund Pending.` : '');

            for (const b of targetBookings) {
                b.status = 'cancelled';
                b.notes = (b.notes ? b.notes + '\n' : '') + cancelNote;
                b.cancellation_fee = 0;
                if (b.payment_status === 'paid') b.payment_status = 'refund_pending';
                await b.save();
            }

            if (totalPaid > 0) {
                const Payment = require('../models/Payment');
                await Payment.updateMany(
                    { booking_id: { $in: targetBookings.map(t => t._id) }, status: 'completed' },
                    { $set: { status: 'refund_pending' } }
                );
            }
        } else {
            for (const b of targetBookings) {
                b.status = status;
                await b.save();
            }
        }

        res.json({ success: true, data: targetBookings[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bookings/verify — Owner: scan QR to verify a booking
router.post('/verify', authenticate, authorize('owner', 'staff', 'admin'), async (req, res) => {
    try {
        const { verification_code } = req.body;
        if (!verification_code) {
            return res.status(400).json({ success: false, message: 'Verification code is required.' });
        }

        const booking = await Booking.findOne({ verification_code })
            .populate('service_id')
            .populate('resource_id')
            .populate('customer_id', 'name email phone');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Invalid verification code.' });
        }

        // Ensure the booking is paid before verification
        let criteria;
        if (booking.group_id) {
            criteria = { group_id: booking.group_id, status: { $ne: 'cancelled' } };
        } else {
            // Fallback: group by date, service, and resource for legacy data
            const startOfDay = new Date(booking.start_datetime);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(booking.start_datetime);
            endOfDay.setHours(23, 59, 59, 999);

            criteria = {
                service_id: booking.service_id._id || booking.service_id,
                resource_id: booking.resource_id?._id || booking.resource_id,
                start_datetime: { $gte: startOfDay, $lte: endOfDay },
                status: { $ne: 'cancelled' }
            };
        }

        const bookingsToVerify = await Booking.find(criteria);

        // Ensure all are paid
        const allPaid = bookingsToVerify.every(b => b.payment_status === 'paid');
        if (!allPaid) {
            return res.status(400).json({ success: false, message: 'All associated bookings must be paid before verification.' });
        }

        const alreadyVerified = bookingsToVerify.every(b => b.is_verified);

        if (alreadyVerified) {
            return res.status(400).json({
                success: false,
                message: 'All associated bookings are already verified.',
                data: booking.group_id ? bookingsToVerify : booking
            });
        }

        // Update all related bookings
        await Booking.updateMany(criteria, {
            is_verified: true,
            status: 'completed',
            verified_by: req.user._id // Track who verified
        });

        // Get updated list for response
        const updatedBookings = await Booking.find(criteria)
            .populate('service_id', 'name')
            .populate('resource_id', 'name');

        res.json({
            success: true,
            message: updatedBookings.length > 1 ? `${updatedBookings.length} sessions verified successfully!` : 'Booking verified successfully!',
            data: updatedBookings
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bookings/:id/cancel — Customer: Cancel a booking with 5-day rule
router.post('/:id/cancel', authenticate, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const { bankName, accountName, accountNumber, customer_bank_qr_image } = req.body;
        const booking = await Booking.findById(bookingId).populate('service_id');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.customer_id?.toString() !== req.user._id.toString() && req.user.role === 'customer') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        // Fetch all related bookings if it's part of a group
        let targetBookings = [];
        if (booking.group_id) {
            targetBookings = await Booking.find({ group_id: booking.group_id }).populate('service_id');
        } else {
            // Fallback for legacy bookings grouped by date, service, resource
            const bDatePrefix = booking.start_datetime.toISOString().split('T')[0];
            const startOfDay = new Date(bDatePrefix);
            const endOfDay = new Date(startOfDay);
            endOfDay.setDate(endOfDay.getDate() + 1);

            targetBookings = await Booking.find({
                customer_id: booking.customer_id,
                service_id: booking.service_id,
                resource_id: booking.resource_id,
                status: booking.status,
                start_datetime: { $gte: startOfDay, $lt: endOfDay }
            }).populate('service_id');

            if (targetBookings.length === 0) targetBookings = [booking];
        }

        // Ensure all are cancelable
        const now = new Date();
        for (const b of targetBookings) {
            if (['cancelled', 'completed', 'no_show'].includes(b.status)) {
                return res.status(400).json({ success: false, message: `A session in this booking cannot be cancelled because it is already ${b.status}.` });
            }
            const bStart = new Date(b.start_datetime);
            const bDaysUntil = (bStart - now) / (1000 * 60 * 60 * 24);
            if (bDaysUntil < 5) {
                return res.status(400).json({ success: false, message: 'All sessions must be at least 5 days prior to start date to cancel.' });
            }
        }

        // Apply a 15% cancellation fee if they paid in advance (calculated on the total paid for the group)
        let totalPaid = 0;
        let originalCurrency = booking.currency;
        targetBookings.forEach(b => {
            if (b.payment_status === 'paid' && b.amount_paid > 0) {
                totalPaid += b.amount_paid;
            }
        });

        const totalFee = totalPaid > 0 ? totalPaid * 0.15 : 0;
        const formatNotesDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const cancelNote = `Cancelled by customer on ${formatNotesDate(now)}.` +
            (totalPaid > 0 ? ` Cancellation fee applied: ${totalFee} ${originalCurrency}. Refund Pending to ${bankName} (${accountName} - ${accountNumber}).` : '');

        for (const b of targetBookings) {
            b.status = 'cancelled';
            b.notes = (b.notes ? b.notes + '\n' : '') + cancelNote;

            // Distribute cancellation fee to the first booking only to avoid double-counting
            if (b._id.toString() === targetBookings[0]._id.toString()) {
                b.cancellation_fee = totalFee;
            } else {
                b.cancellation_fee = 0;
            }

            if (b.payment_status === 'paid') {
                b.payment_status = 'refund_pending';
                if (customer_bank_qr_image) {
                    b.customer_bank_qr_image = customer_bank_qr_image;
                }
            }
            await b.save();
        }

        // ... targetBookings cancellation fee logic ...
        if (totalPaid > 0) {
            const Payment = require('../models/Payment');
            await Payment.updateMany(
                { booking_id: { $in: targetBookings.map(b => b._id) }, status: 'completed' },
                { $set: { status: 'refund_pending' } }
            );
        }

        res.json({ success: true, message: 'Booking cancelled successfully.', data: targetBookings[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/bookings/:id/draft — Customer: Internal fallback to delete unpaid pending bookings if payment gateway fails
router.delete('/:id/draft', authenticate, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

        if (booking.customer_id?.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        if (booking.status === 'pending' && booking.payment_status === 'unpaid') {
            if (booking.group_id) {
                await Booking.deleteMany({ group_id: booking.group_id, status: 'pending', payment_status: 'unpaid' });
            } else {
                await booking.deleteOne();
            }
            return res.json({ success: true, message: 'Draft booking removed.' });
        } else {
            return res.status(400).json({ success: false, message: 'Cannot delete a confirmed or paid booking.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/bookings/:id/postpone — Customer: Postpone a booking (max 2 times, max 2 weeks out, > 5 days notice)
router.post('/:id/postpone', authenticate, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const { new_start_datetime, new_end_datetime } = req.body;

        if (!new_start_datetime || !new_end_datetime) {
            return res.status(400).json({ success: false, message: 'New start and end dates are required.' });
        }

        const booking = await Booking.findById(bookingId).populate('service_id');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.customer_id?.toString() !== req.user._id.toString() && req.user.role === 'customer') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
            return res.status(400).json({ success: false, message: `Booking cannot be postponed because it is ${booking.status}.` });
        }

        if (booking.postpone_count >= 2) {
            return res.status(400).json({ success: false, message: 'This booking has reached the maximum number of postponements (2).' });
        }

        const now = new Date();
        const currentStartDate = new Date(booking.start_datetime);
        const daysUntilCurrentStart = (currentStartDate - now) / (1000 * 60 * 60 * 24);

        if (daysUntilCurrentStart < 5) {
            return res.status(400).json({ success: false, message: 'Bookings can only be postponed at least 5 days prior to the original start date.' });
        }

        const proposedStartDate = new Date(new_start_datetime);
        const proposedEndDate = new Date(new_end_datetime);
        const currentEndDate = new Date(booking.end_datetime);

        // The new start date must be at least the day after the original booking ends
        const minStartDateFromEnd = new Date(currentEndDate);
        minStartDateFromEnd.setDate(minStartDateFromEnd.getDate() + 1);
        minStartDateFromEnd.setHours(0, 0, 0, 0);

        if (proposedStartDate < minStartDateFromEnd) {
            return res.status(400).json({ success: false, message: 'Bookings must be postponed to a date that begins after the original booking has ended.' });
        }

        // Ensure new date is at least 5 days out from original date, and within the max allowed shift
        const daysShifted = (proposedStartDate - currentStartDate) / (1000 * 60 * 60 * 24);
        const maxShiftDays = booking.postpone_count === 0 ? 14 : 7;

        if (daysShifted < 5) {
            return res.status(400).json({ success: false, message: 'Bookings must be postponed to a date at least 5 days after the original date.' });
        }
        if (daysShifted > maxShiftDays) {
            return res.status(400).json({ success: false, message: `Bookings can only be postponed by a maximum of ${maxShiftDays} days from the original date.` });
        }

        // Check availability for the new dates
        if (booking.resource_id) {
            const overlapping = await Booking.find({
                _id: { $ne: booking._id }, // Exclude current booking
                resource_id: booking.resource_id,
                status: { $in: ['pending', 'confirmed'] },
                start_datetime: { $lt: proposedEndDate },
                end_datetime: { $gt: proposedStartDate },
            });

            const bookedQty = overlapping.reduce((sum, b) => sum + (b.quantity || 1), 0);

            // Re-fetch resource safely
            const Resource = require('../models/Resource');
            const resource = await Resource.findById(booking.resource_id);
            const totalQty = resource ? (resource.quantity || 1) : 1;

            if (bookedQty + booking.quantity > totalQty) {
                return res.status(409).json({ success: false, message: 'The proposed new dates are not available.' });
            }
        }

        booking.start_datetime = proposedStartDate;
        booking.end_datetime = proposedEndDate;
        booking.postpone_count += 1;

        const formatNotesDate = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        booking.notes = (booking.notes ? booking.notes + '\n' : '') + `Postponed from ${formatNotesDate(currentStartDate)} to ${formatNotesDate(proposedStartDate)}. Postponement count: ${booking.postpone_count}.`;

        await booking.save();
        res.json({ success: true, message: `Booking successfully postponed to ${formatNotesDate(proposedStartDate)}.`, data: booking });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/bookings/qr/:id — Customer: get QR code image for a booking
router.get('/qr/:id', authenticate, async (req, res) => {
    try {
        const QRCode = require('qrcode');
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Only the customer who made the booking can get the QR
        if (booking.customer_id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        // QR contains a JSON payload with booking details
        const qrPayload = JSON.stringify({
            code: booking.verification_code,
            booking_id: booking._id,
            service: booking.service_id,
            date: booking.start_datetime,
        });

        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
            width: 300,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' },
        });

        res.json({ success: true, data: { qr: qrDataUrl, verification_code: booking.verification_code } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── Confirm Payment (mark booking as paid after gateway success) ──
router.post('/:id/confirm-payment', authenticate, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Only the customer or admin can confirm payment
        if (booking.customer_id && booking.customer_id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied.' });
        }

        if (booking.payment_status === 'paid') {
            return res.status(400).json({ success: false, message: 'Booking is already paid.' });
        }

        // Handle Group Confirmation (Demo or Manual)
        let targetBookings = [];
        if (booking.group_id) {
            targetBookings = await Booking.find({ group_id: booking.group_id });
        } else {
            targetBookings = [booking];
        }

        for (const b of targetBookings) {
            const isHalf = b.payment_method === 'half';
            const amountToPay = isHalf ? Math.ceil(b.total_price / 2) : b.total_price;

            b.payment_status = 'paid';
            b.amount_paid = amountToPay;
            b.status = 'confirmed';
            b.notes = (b.notes || '') + `\nPayment confirmed via Demo/System (${isHalf ? '50%' : '100%'}) on ${new Date().toLocaleString()}`;
            await b.save();
        }

        const updated = await Booking.findById(req.params.id);
        res.json({ success: true, data: updated, count: targetBookings.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
