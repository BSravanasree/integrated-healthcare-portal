const { HttpError } = require('../utils/http');

/** Validate req[source] against a zod schema and replace it with the parsed (typed, trimmed) value. */
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(new HttpError(400, details[0]?.message || 'Invalid input', details));
  }
  req.valid = { ...(req.valid || {}), [source]: result.data };
  next();
};

module.exports = { validate };
