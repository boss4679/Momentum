const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { idParams } = require('../schemas/common');
const schemas = require('../schemas/workout');
const controller = require('../controllers/workouts');

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), controller.list);
router.post('/', validate({ body: schemas.body }), controller.create);
// Registered before '/:id'. Express matches routes in order, and "personal-bests" would
// otherwise be read as an :id (and rejected as not a number).
router.get('/personal-bests', controller.personalBests);
router.get('/:id', validate({ params: idParams }), controller.get);
router.put('/:id', validate({ params: idParams, body: schemas.body }), controller.update);
router.delete('/:id', validate({ params: idParams }), controller.remove);

module.exports = router;
