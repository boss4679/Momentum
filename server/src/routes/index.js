// Mounts every resource router under /api. Each resource router applies `authenticate` to
// all of its own routes; health and auth are the only public ones.
const { Router } = require('express');
const { health } = require('../controllers/health');

const router = Router();

router.get('/health', health);
router.use('/auth', require('./auth'));
router.use('/exercises', require('./exercises'));
router.use('/workouts', require('./workouts'));
router.use('/events', require('./events'));
router.use('/food-entries', require('./foodEntries'));
router.use('/goals', require('./goals'));
router.use('/summary', require('./summary'));

module.exports = router;
