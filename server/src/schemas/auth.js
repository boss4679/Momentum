const { z } = require('zod');
const { timezone } = require('./common');

// Trim and lower-case *before* checking the format, so " Bob@Example.com " is stored as
// "bob@example.com". That matches the users_email_lowercase CHECK, and makes duplicate
// detection case-insensitive.
const email = z
  .string('Email is required')
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email address').max(254, 'Email is too long'));

// bcrypt only uses the first 72 *bytes* of a password and silently ignores the rest. Two
// long passwords sharing a 72-byte prefix would both be accepted, so longer ones are rejected
// outright. (Bytes, not characters: an emoji is 4 bytes.)
const password = z
  .string('Password is required')
  .min(8, 'Password must be at least 8 characters')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Password must be at most 72 bytes');

// .strict() rejects unknown keys, so a typo like "pasword" fails loudly instead of being ignored.
const register = z
  .object({
    email,
    password,
    timezone: timezone.optional(),
  })
  .strict();

// Login doesn't re-check password rules: those apply when choosing a password, not when
// typing it in. Login only needs something to compare against.
const login = z
  .object({
    email,
    password: z.string('Password is required').min(1, 'Password is required'),
  })
  .strict();

module.exports = { register, login };
