import { api } from './session.tsx';
import { prefs } from './prefs';
import { parseSaved, pickSemester } from './lib/semester.ts';

const KEY = 'semester.current';

export const loadSemesters = async () => {
  const [list, saved] = await Promise.all([api.overview(), prefs.read(KEY)]);
  return { list, currentId: pickSemester(list, parseSaved(saved)) };
};

export const chooseSemester = (id: number) => prefs.save(KEY, String(id));
