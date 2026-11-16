// Turns the Zod schemas that validate requests into OpenAPI request documentation, so the
// docs can't drift from what the API really accepts: change a schema and the docs change.
//
// Zod 4 can emit JSON Schema (draft 2020-12), which OpenAPI 3.1 uses as-is.
// Things JSON Schema can't express, like .refine() rules ("endsAt must be after startsAt"),
// don't appear here; those are written into the operation descriptions instead.
const { z } = require('zod');

// io: 'input' describes what a client SENDS (before defaults and coercion are applied).
function toJsonSchema(schema) {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });
  delete json.$schema;
  return tidy(json);
}

// Zod's date and date-time checks come out as `format` plus a very long regex. The format
// already says it, and the regex makes the docs unreadable, so the pattern is dropped.
function tidy(node) {
  if (Array.isArray(node)) return node.map(tidy);
  if (node === null || typeof node !== 'object') return node;
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'pattern' && (node.format === 'date' || node.format === 'date-time')) continue;
    result[key] = tidy(value);
  }
  return result;
}

// A z.object() for the query string or path -> OpenAPI's list of parameters.
function parameters(schema, location) {
  const json = toJsonSchema(schema);
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties).map(([name, property]) => ({
    name,
    in: location,
    required: location === 'path' || required.has(name),
    schema: property,
  }));
}

function requestBody(schema) {
  return {
    required: true,
    content: { 'application/json': { schema: toJsonSchema(schema) } },
  };
}

module.exports = {
  queryParameters: (schema) => parameters(schema, 'query'),
  pathParameters: (schema) => parameters(schema, 'path'),
  requestBody,
};
