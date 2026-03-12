const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');

// POST /api/payments/webhook
// This endpoint receives status updates from the Phajay Payment Gateway
router.post('/webhook', async (req, res) => {
    try {
        const { status, orderNo, transactionId, paymentMethod, txnAmount } = req.body;

        console.log('--- Incoming Payment Webhook ---');
        console.log('Order:', orderNo);
        console.log('Status:', status);
        console.log('Transaction:', transactionId);

        // We only process PAYMENT_COMPLETED
        if (status !== 'PAYMENT_COMPLETED') {
            return res.json({ success: true, message: 'Status ignored' });
        }

        if (!orderNo) {
            return res.status(400).json({ success: false, message: 'Missing orderNo' });
        }

        // Find the booking (orderNo matches booking._id or group_id)
        // Since we pass booking._id as orderNo in the Link request
        const booking = await Booking.findById(orderNo);
        if (!booking) {
            // Also try searching by orderNo in notes or custom field if needed, 
            // but here we used _id as orderNo.
            console.error('Booking not found for orderNo:', orderNo);
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // If it's a group booking, update all in the group
        let targetBookings = [];
        if (booking.group_id) {
            targetBookings = await Booking.find({ group_id: booking.group_id });
        } else {
            targetBookings = [booking];
        }

        for (const b of targetBookings) {
            // Mark as paid
            b.payment_status = 'paid';
            b.amount_paid = b.total_price; // or use txnAmount if split logic exists

            // If it was pending, confirm it
            if (b.status === 'pending') {
                b.status = 'confirmed';
            }

            b.notes = (b.notes ? b.notes + '\n' : '') + `Payment confirmed via Gateway (${paymentMethod}) on ${new Date().toLocaleString()}. Transaction ID: ${transactionId}`;
            await b.save();
        }

        // Update the Payment record if one exists, or create one
        await Payment.findOneAndUpdate(
            { booking_id: booking._id },
            {
                status: 'completed',
                transaction_id: transactionId,
                payment_method: 'online_gateway',
                amount: txnAmount || booking.total_price,
                notes: `Gateway: ${paymentMethod}`
            },
            { upsert: true }
        );

        console.log(`Successfully updated ${targetBookings.length} booking(s) for Order: ${orderNo}`);

        // Always respond with 200/OK to the gateway
        res.json({ success: true, message: 'Webhook processed' });

    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
