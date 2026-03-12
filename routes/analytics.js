const express = require('express');
const { getKPIs, getRevenue, getSources, getTopServices, getGuestVolume, getPeakHours, getStatusDistribution } = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All analytics endpoints require the user to be an authenticated owner or admin
router.use(authenticate, authorize('owner', 'admin'));

router.get('/kpi', getKPIs);
router.get('/revenue', getRevenue);
router.get('/sources', getSources);
router.get('/services', getTopServices);
router.get('/guest-volume', getGuestVolume);
router.get('/peak-hours', getPeakHours);
router.get('/status-distribution', getStatusDistribution);

module.exports = router;
