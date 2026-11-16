const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { idParams } = require('../schemas/common');
const schemas = require('../schemas/event');
const controller = require('../controllers/events');

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), controller.list);
router.post('/', validate({ query: schemas.writeQuery, body: schemas.body }), controller.create);
router.get('/:id', validate({ params: idParams }), controller.get);
router.put(
  '/:id',
  validate({ params: idParams, query: schemas.writeQuery, body: schemas.body }),
  controller.update,
);
router.delete('/:id', validate({ params: idParams }), controller.remove);

module.exports = router;
