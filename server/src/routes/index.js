// Mounts every resource router under /api. Milestone 3 adds the module routers here
// (each one applies `authenticate` to all of its routes).
const { Router } = require('express');
const { health } = require('../controllers/health');
const authRoutes = require('./auth');

const router = Router();

router.get('/health', health);
router.use('/auth', authRoutes);

module.exports = router;
