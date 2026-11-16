const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { idParams } = require('../schemas/common');
const schemas = require('../schemas/foodEntry');
const controller = require('../controllers/foodEntries');

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), controller.list);
router.post('/', validate({ body: schemas.body }), controller.create);
router.get('/:id', validate({ params: idParams }), controller.get);
router.put('/:id', validate({ params: idParams, body: schemas.body }), controller.update);
router.delete('/:id', validate({ params: idParams }), controller.remove);

module.exports = router;
