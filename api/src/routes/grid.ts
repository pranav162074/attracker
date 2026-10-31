import express from 'express';
import { HttpError } from '../http/errors.ts';
import { idParam } from '../http/params.ts';
import { validateBody } from '../middleware/validate.ts';
import { putGridSchema } from '../grid/schemas.ts';
import type { PutGrid } from '../grid/schemas.ts';
import { deleteVersion, getGrid, listVersions, putGrid } from '../grid/repo.ts';
import { dateSchema } from '../timetables/schemas.ts';

export const gridRoutes = express.Router({ mergeParams: true });

const timetableId = (params: Record<string, unknown>) => idParam(params.timetableId, 'Timetable');

gridRoutes.get('/', async (req, res) => {
  let on: string | undefined;
  if (req.query.on !== undefined) {
    const parsed = dateSchema('on').safeParse(req.query.on);
    if (!parsed.success) throw new HttpError(400, 'validation_error', parsed.error.issues[0]!.message);
    on = parsed.data;
  }
  res.json(await getGrid(req.auth!.userId, timetableId(req.params), on));
});

gridRoutes.get('/versions', async (req, res) => {
  res.json({ versions: await listVersions(req.auth!.userId, timetableId(req.params)) });
});

gridRoutes.put('/', validateBody(putGridSchema), async (req, res) => {
  const result = await putGrid(req.auth!.userId, timetableId(req.params), req.body as PutGrid);
  res.status(result.summary.created ? 201 : 200).json(result);
});

gridRoutes.delete('/versions/:versionId', async (req, res) => {
  await deleteVersion(req.auth!.userId, timetableId(req.params), idParam(req.params.versionId, 'Grid version'), req.query.discardMarks === 'true');
  res.status(204).end();
});
