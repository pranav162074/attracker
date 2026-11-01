import express from 'express';
import { HttpError } from '../http/errors.ts';
import { idParam } from '../http/params.ts';
import { validateBody } from '../middleware/validate.ts';
import { deleteCheckpoint, listCheckpoints, previewSheet, saveCheckpoint, saveCheckpointSchema } from '../checkpoints/repo.ts';
import type { SaveCheckpoint } from '../checkpoints/repo.ts';

export const checkpointRoutes = express.Router({ mergeParams: true });

const timetableId = (params: Record<string, unknown>) => idParam(params.timetableId, 'Timetable');

checkpointRoutes.get('/', async (req, res) => {
  res.json({ checkpoints: await listCheckpoints(req.auth!.userId, timetableId(req.params)) });
});

checkpointRoutes.post('/', validateBody(saveCheckpointSchema), async (req, res) => {
  res.status(201).json({ checkpoint: await saveCheckpoint(req.auth!.userId, timetableId(req.params), req.body as SaveCheckpoint) });
});

checkpointRoutes.post('/sheet', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
  const registration = typeof req.query.registration === 'string' ? req.query.registration.trim() : '';
  if (!/^[A-Za-z0-9-]{3,30}$/.test(registration)) {
    throw new HttpError(400, 'validation_error', 'Add your registration number, like ?registration=324103311015');
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'validation_error', 'Upload the attendance sheet file');
  res.json({ preview: await previewSheet(req.auth!.userId, timetableId(req.params), req.body, registration) });
});

checkpointRoutes.delete('/:checkpointId', async (req, res) => {
  await deleteCheckpoint(req.auth!.userId, timetableId(req.params), idParam(req.params.checkpointId, 'Checkpoint'));
  res.status(204).end();
});
