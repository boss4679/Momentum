// Shared submit logic for every form: tracks "submitting", and turns an ApiError into
//   fieldErrors: { email: 'Must be a valid email address', 'sets.1.reps': '...' }
//   formError:   a message for the top of the form
// so each input can show the server's message right next to it.
import { useState } from 'react';
import { ApiError } from '../api/client';

export function useFormSubmit(onSubmit) {
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function submit(...args) {
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      return await onSubmit(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors());
        setFormError(error);
      } else {
        // A bug in our own code, not an API answer. Show something rather than nothing.
        setFormError(new ApiError(0, 'CLIENT_ERROR', 'Something went wrong. Please try again.'));
      }
      return undefined;
    } finally {
      setSubmitting(false);
    }
  }

  function clearErrors() {
    setFieldErrors({});
    setFormError(null);
  }

  return { submit, submitting, fieldErrors, formError, clearErrors };
}
