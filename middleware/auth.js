const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id);
        if (!user || !user.is_active) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

// Authorize by role
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
        }
        next();
    };
};

// Enforce multi-tenant isolation (owner/staff can only access their business)
const tenantGuard = (req, res, next) => {
    if (req.user.role === 'admin') return next(); // Admins bypass

    const businessId = req.params.businessId || req.body.business_id || req.query.business_id;
    if (businessId && req.user.business_id && req.user.business_id.toString() !== businessId) {
        return res.status(403).json({ success: false, message: 'Access denied to this business.' });
    }
    next();
};

module.exports = { authenticate, authorize, tenantGuard };
