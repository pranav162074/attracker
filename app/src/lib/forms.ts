import { ApiError, NetworkError } from './api.ts';
import type { FieldErrors } from './api.ts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normaliseEmail = (value: string) => value.trim().toLowerCase();

export const checkEmail = (value: string) => {
  const email = normaliseEmail(value);
  if (!email) return 'Enter your email';
  if (email.length > 254) return 'Email is too long';
  if (!EMAIL.test(email)) return 'Enter a valid email address';
  return null;
};

export const checkNewPassword = (value: string) => {
  if (!value) return 'Enter a password';
  if (value.length < 8) return 'Password must be at least 8 characters';
  if (value.length > 128) return 'Password must be at most 128 characters';
  if (!value.trim()) return 'Password cannot be only spaces';
  return null;
};

export type LoginForm = { email: string; password: string };
export type SignupForm = LoginForm & { confirm: string };

const collect = (entries: [string, string | null][]): FieldErrors => {
  const errors: FieldErrors = {};
  for (const [field, message] of entries) if (message) errors[field] = message;
  return errors;
};

export const checkLogin = (form: LoginForm) =>
  collect([
    ['email', checkEmail(form.email)],
    ['password', form.password ? null : 'Enter your password'],
  ]);

export const checkSignup = (form: SignupForm) =>
  collect([
    ['email', checkEmail(form.email)],
    ['password', checkNewPassword(form.password)],
    ['confirm', form.confirm === form.password ? null : 'Passwords do not match'],
  ]);

export type FormProblem = { fields: FieldErrors; message: string | null };

export const problemFrom = (error: unknown): FormProblem => {
  if (error instanceof ApiError) {
    if (error.code === 'email_taken') return { fields: { email: 'An account with this email already exists. Log in instead.' }, message: null };
    if (Object.keys(error.fields).length > 0) return { fields: error.fields, message: null };
    if (error.status === 429) return { fields: {}, message: 'Too many attempts. Wait a few minutes and try again.' };
    return { fields: {}, message: error.message };
  }
  if (error instanceof NetworkError) return { fields: {}, message: error.message };
  return { fields: {}, message: 'Something went wrong. Try again.' };
};
