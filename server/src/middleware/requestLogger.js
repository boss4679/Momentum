// One line per request: "GET /api/workouts 200 12.3ms".
// The line is written on the response's 'finish' event, because only then are the final
// status code and the total time known.
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });

  next();
}

module.exports = requestLogger;
