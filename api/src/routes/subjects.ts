import express from 'express';
import { idParam } from '../http/params.ts';
import { validateBody } from '../middleware/validate.ts';
import { createSubjectSchema, updateSubjectSchema } from '../subjects/schemas.ts';
import type { CreateSubject, UpdateSubject } from '../subjects/schemas.ts';
import { createSubject, deleteSubject, listSubjects, updateSubject } from '../subjects/repo.ts';

export const subjectRoutes = express.Router({ mergeParams: true });

const timetableId = (params: Record<string, unknown>) => idParam(params.timetableId, 'Timetable');

subjectRoutes.get('/', async (req, res) => {
  const subjects = await listSubjects(req.auth!.userId, timetableId(req.params), req.query.archived === 'true');
  res.json({ subjects });
});

subjectRoutes.post('/', validateBody(createSubjectSchema), async (req, res) => {
  const subject = await createSubject(req.auth!.userId, timetableId(req.params), req.body as CreateSubject);
  res.status(201).json({ subject });
});

subjectRoutes.patch('/:subjectId', validateBody(updateSubjectSchema), async (req, res) => {
  const subject = await updateSubject(
    req.auth!.userId,
    timetableId(req.params),
    idParam(req.params.subjectId, 'Subject'),
    req.body as UpdateSubject
  );
  res.json({ subject });
});

subjectRoutes.delete('/:subjectId', async (req, res) => {
  await deleteSubject(req.auth!.userId, timetableId(req.params), idParam(req.params.subjectId, 'Subject'));
  res.status(204).end();
});
