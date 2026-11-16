// The email + password form shared by the login and register pages.
import { useState } from 'react';
import { Field, FormError } from './Field';
import { useFormSubmit } from '../hooks/useFormSubmit';

export default function AuthForm({ title, submitLabel, onSubmit, notice, footer, passwordHint }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { submit, submitting, fieldErrors, formError } = useFormSubmit(onSubmit);

  function handleSubmit(event) {
    event.preventDefault(); // stop the browser's own full-page form submission
    submit(email, password);
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <div className="brand brand--centered">
          <span className="brand__mark" aria-hidden="true">
            M
          </span>
          <h1>{title}</h1>
        </div>
        {notice && <p className="notice">{notice}</p>}
        {/* Field errors are shown on the inputs; the banner covers errors with no field. */}
        <FormError error={Object.keys(fieldErrors).length === 0 ? formError : null} />

        <Field label="Email" id="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" id="password" error={fieldErrors.password} hint={passwordHint}>
          <input
            id="password"
            type="password"
            autoComplete={passwordHint ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Please wait…' : submitLabel}
        </button>
        <p className="auth-card__footer">{footer}</p>
      </form>
    </div>
  );
}
