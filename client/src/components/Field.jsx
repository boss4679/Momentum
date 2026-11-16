// A labelled form control with room for its validation message underneath.
//
//   <Field label="Email" id="email" error={fieldErrors.email}>
//     <input id="email" ... />
//   </Field>
//
// When there's an error, the input is marked aria-invalid and linked to the message with
// aria-describedby, so a screen reader reads the error when the input gets focus.
import { Children, cloneElement } from 'react';

export function Field({ label, id, error, hint, children }) {
  const errorId = `${id}-error`;
  const control = Children.only(children);
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(control, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  );
}

// The error banner at the top of a form, for problems not tied to a single field (wrong
// password, overlapping event) or as a summary when several fields failed.
export function FormError({ error, children }) {
  if (!error) return null;
  return (
    <div className="form-error" role="alert">
      <p>{error.message}</p>
      {children}
    </div>
  );
}
