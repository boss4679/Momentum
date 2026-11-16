// Builds the Express app without starting it. Keeping this separate from server.js lets
// the tests import the app and drive it with Supertest, no open port needed.
//
// Middleware order matters: Express runs it top to bottom.
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const openApiDocument = require('./docs/openapi');

const app = express();

// Don't advertise "X-Powered-By: Express" to every client.
app.disable('x-powered-by');

if (config.logRequests) {
  app.use(requestLogger);
}

// Parses JSON bodies. The size limit caps how much a single request can make the server
// buffer; 100kb is far more than any real request here needs.
app.use(express.json({ limit: '100kb' }));

// API documentation: the raw OpenAPI document, and Swagger UI to browse and try it.
app.get('/api/docs/openapi.json', (req, res) => res.json(openApiDocument));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use('/api', apiRoutes);

// Anything that matched no route above.
app.use(notFound);

// Last: errors from anywhere above end up here.
app.use(errorHandler);

module.exports = app;
