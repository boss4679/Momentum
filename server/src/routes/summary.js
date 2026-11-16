const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const schemas = require('../schemas/summary');
const controller = require('../controllers/summary');

const router = Router();

router.use(authenticate);

router.get('/daily', validate({ query: schemas.dailyQuery }), controller.daily);
router.get('/trends', validate({ query: schemas.trendsQuery }), controller.trends);

module.exports = router;
