// A small checker for "does this response match its OpenAPI schema?". It understands just
// the parts of JSON Schema the docs use ($ref, anyOf, type, properties, required, items,
// enum), and it also flags fields the response has but the docs don't mention.
// A full validator library would do more, but this is enough to keep docs and API in step.

function resolve(schema, document) {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace('#/components/schemas/', '');
  return document.components.schemas[name];
}

const TYPE_CHECKS = {
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  array: Array.isArray,
  integer: Number.isInteger,
  number: (v) => typeof v === 'number',
  string: (v) => typeof v === 'string',
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
};

// Returns a list of problems like "data[0].sets[1].reps: expected integer, got string".
function schemaProblems(rawSchema, value, document, path = 'response') {
  const schema = resolve(rawSchema, document);

  if (schema.anyOf) {
    const fits = schema.anyOf.some(
      (option) => schemaProblems(option, value, document, path).length === 0,
    );
    return fits
      ? []
      : [`${path}: matches none of the allowed shapes (got ${JSON.stringify(value)})`];
  }

  if (schema.type && !TYPE_CHECKS[schema.type](value)) {
    return [`${path}: expected ${schema.type}, got ${JSON.stringify(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`];
  }

  const problems = [];
  if (schema.type === 'object' && schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) problems.push(`${path}.${key}: documented but missing`);
    }
    for (const [key, child] of Object.entries(value)) {
      const property = schema.properties[key];
      if (!property) problems.push(`${path}.${key}: returned but not documented`);
      else problems.push(...schemaProblems(property, child, document, `${path}.${key}`));
    }
  }
  if (schema.type === 'array' && schema.items) {
    value.forEach((item, i) =>
      problems.push(...schemaProblems(schema.items, item, document, `${path}[${i}]`)),
    );
  }
  return problems;
}

module.exports = { schemaProblems };
