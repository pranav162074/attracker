import { describe, it, expect } from 'vitest';
import { ApiError, NetworkError } from '../src/lib/api.ts';
import { checkEmail, checkLogin, checkNewPassword, checkSignup, normaliseEmail, problemFrom } from '../src/lib/forms.ts';

describe('form checks', () => {
  it('checks emails the same way the server does', () => {
    expect(checkEmail('')).toBe('Enter your email');
    expect(checkEmail('   ')).toBe('Enter your email');
    expect(checkEmail('asha')).toBe('Enter a valid email address');
    expect(checkEmail('asha@college')).toBe('Enter a valid email address');
    expect(checkEmail(`${'a'.repeat(250)}@x.in`)).toBe('Email is too long');
    expect(checkEmail('  Asha@Example.com ')).toBeNull();
    expect(normaliseEmail('  Asha@Example.com ')).toBe('asha@example.com');
  });

  it('checks new passwords the same way the server does', () => {
    expect(checkNewPassword('')).toBe('Enter a password');
    expect(checkNewPassword('1234567')).toBe('Password must be at least 8 characters');
    expect(checkNewPassword('        ')).toBe('Password cannot be only spaces');
    expect(checkNewPassword('x'.repeat(129))).toBe('Password must be at most 128 characters');
    expect(checkNewPassword('correct horse')).toBeNull();
  });

  it('only asks for something in the login password, since old accounts may have any password', () => {
    expect(checkLogin({ email: 'asha@example.com', password: '' })).toEqual({ password: 'Enter your password' });
    expect(checkLogin({ email: 'asha@example.com', password: 'x' })).toEqual({});
  });

  it('makes sure both passwords match when signing up', () => {
    expect(checkSignup({ email: 'asha@example.com', password: 'correct horse', confirm: 'correct hors' })).toEqual({ confirm: 'Passwords do not match' });
    expect(checkSignup({ email: '', password: '', confirm: '' })).toEqual({ email: 'Enter your email', password: 'Enter a password' });
    expect(checkSignup({ email: 'asha@example.com', password: 'correct horse', confirm: 'correct horse' })).toEqual({});
  });
});

describe('showing what went wrong', () => {
  it('puts a taken email next to the email field', () => {
    expect(problemFrom(new ApiError(409, 'email_taken', 'An account with this email already exists'))).toEqual({
      fields: { email: 'An account with this email already exists. Log in instead.' },
      message: null,
    });
  });

  it('puts server field errors next to their fields', () => {
    const error = new ApiError(400, 'validation_error', 'Enter a valid email address', { email: 'Enter a valid email address' });
    expect(problemFrom(error)).toEqual({ fields: { email: 'Enter a valid email address' }, message: null });
  });

  it('explains rate limits, wrong passwords and lost connections in plain words', () => {
    expect(problemFrom(new ApiError(429, 'rate_limited', 'Too many requests')).message).toBe('Too many attempts. Wait a few minutes and try again.');
    expect(problemFrom(new ApiError(401, 'invalid_credentials', 'Email or password is incorrect')).message).toBe('Email or password is incorrect');
    expect(problemFrom(new NetworkError()).message).toMatch(/Check your internet connection/);
    expect(problemFrom(new Error('boom')).message).toBe('Something went wrong. Try again.');
  });
});
