const { Router } = require('express');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const schemas = require('../schemas/auth');
const controller = require('../controllers/auth');

const router = Router();

router.post('/register', validate({ body: schemas.register }), controller.register);
router.post('/login', validate({ body: schemas.login }), controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
