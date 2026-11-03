import { env } from '../config/env.ts';
import { logger } from '../config/logger.ts';

export type Email = { to: string; subject: string; text: string };

export class EmailFailedError extends Error {
  constructor(status: number) {
    super(`The email service answered with status ${status}`);
  }
}

export const sentEmails: Email[] = [];

export const emailEnabled = () => env.email.transport !== 'log' || !env.isProduction;

const post = async (url: string, headers: Record<string, string>, body: unknown) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new EmailFailedError(res.status);
};

export const sendEmail = async (email: Email) => {
  const { transport, apiKey, from, fromName } = env.email;
  if (transport === 'brevo') {
    await post('https://api.brevo.com/v3/smtp/email', { 'api-key': apiKey }, {
      sender: { name: fromName, email: from },
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
    });
    return;
  }
  if (transport === 'resend') {
    await post('https://api.resend.com/emails', { authorization: `Bearer ${apiKey}` }, {
      from: `${fromName} <${from}>`,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    });
    return;
  }
  if (env.isTest) {
    sentEmails.push(email);
    return;
  }
  logger.warn({ to: email.to, subject: email.subject, text: email.text }, 'Email not sent because EMAIL_TRANSPORT is log');
};
