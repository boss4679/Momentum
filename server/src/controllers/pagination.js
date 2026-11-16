// Every list endpoint responds with the same envelope:
//   { "data": [...], "pagination": { "limit": 20, "offset": 40, "total": 123 } }
// `total` lets the client show "41-60 of 123" and know whether there's a next page.
function paginated(data, total, { limit, offset }) {
  return { data, pagination: { limit, offset, total } };
}

module.exports = { paginated };
