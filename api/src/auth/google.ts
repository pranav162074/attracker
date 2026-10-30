import { OAuth2Client } from 'google-auth-library';
import type { Certificates } from 'google-auth-library';
import { env } from '../config/env.ts';

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const client = new OAuth2Client();

export const googleCerts = {
  fetch: async (): Promise<Certificates> => (await client.getFederatedSignonCertsAsync()).certs,
};

export class GoogleTokenError extends Error {
  readonly code: 'invalid_google_token' | 'google_email_unverified';

  constructor(code: GoogleTokenError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export const googleSignInEnabled = () => env.googleClientIds.length > 0;

export const verifyGoogleIdToken = async (idToken: string) => {
  let payload;
  try {
    const ticket = await client.verifySignedJwtWithCertsAsync(idToken, await googleCerts.fetch(), env.googleClientIds, ISSUERS);
    payload = ticket.getPayload();
  } catch {
    throw new GoogleTokenError('invalid_google_token', 'Google sign-in could not be verified. Please try again.');
  }
  if (!payload?.sub || !payload.email) {
    throw new GoogleTokenError('invalid_google_token', 'Google did not share an email address for this account');
  }
  if (payload.email_verified !== true) {
    throw new GoogleTokenError('google_email_unverified', 'This Google account has no verified email address');
  }
  return { subject: payload.sub, email: payload.email.trim().toLowerCase() };
};
