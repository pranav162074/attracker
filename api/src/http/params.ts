import { HttpError } from './errors.ts';

export const idParam = (value: unknown, what = 'Item') => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) throw new HttpError(404, 'not_found', `${what} not found`);
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new HttpError(404, 'not_found', `${what} not found`);
  return id;
};
