import { randomInt } from 'node:crypto';

export const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

export const newShareCode = () => Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');

export const normaliseShareCode = (text: string) => {
  const cleaned = text.toUpperCase().replace(/[\s-]/g, '');
  return cleaned.length === CODE_LENGTH && [...cleaned].every((letter) => CODE_LETTERS.includes(letter)) ? cleaned : null;
};

export const formatShareCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
