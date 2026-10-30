import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app.ts';

let ipCounter = 0;
const octet = Math.floor(Math.random() * 200) + 20;

export const testIpPrefix = `10.${octet}.`;

export const freshIp = () => {
  ipCounter += 1;
  return `${testIpPrefix}${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
};

export const createdEmails: string[] = [];

export const newUser = async (label = 'user') => {
  const email = `${label}-${randomUUID()}@example.com`;
  createdEmails.push(email);
  const res = await request(app)
    .post('/auth/signup')
    .set('X-Forwarded-For', freshIp())
    .send({ email, password: 'correct horse battery', client: 'app' });
  if (res.status !== 201) throw new Error(`Could not create a test user: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.token as string;
  const as = {
    get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body?: object) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
    patch: (path: string, body?: object) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
    put: (path: string, body?: object) => request(app).put(path).set('Authorization', `Bearer ${token}`).send(body),
    delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
  };
  return { id: res.body.user.id as number, email, token, ...as };
};
