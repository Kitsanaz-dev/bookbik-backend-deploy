const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

// Route imports
const authRoutes = require('./routes/auth');
const businessRoutes = require('./routes/businesses');
const serviceRoutes = require('./routes/services');
const resourceRoutes = require('./routes/resources');
const availabilityRoutes = require('./routes/availability');
const bookingRoutes = require('./routes/bookings');
const userRoutes = require('./routes/users');
const staffRoutes = require('./routes/staff');
const uploadRoutes = require('./routes/upload');
const posProductRoutes = require('./routes/pos_products');
const posOrderRoutes = require('./routes/pos_orders');
const analyticsRoutes = require('./routes/analytics');
const paymentRoutes = require('./routes/payments');
const favoritesRoutes = require('./routes/favorites');
const path = require('path');

const app = express();

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Logging middleware
app.use(morgan('combined'));

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'BookBik Universal Booking Engine API', success: true, version: "2.0.0", author: "Kitsana" });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/favorites', favoritesRoutes);

// POS Routes
app.use('/api/pos', posProductRoutes);
app.use('/api/pos/orders', posOrderRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

module.exports = app;