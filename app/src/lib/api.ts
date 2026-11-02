export type User = {
  id: number;
  email: string;
  createdAt: string;
  signInMethods?: string[];
};

export type AuthResult = {
  user: User;
  token?: string;
  expiresAt: string;
};

export type Zone = 'safe' | 'condonation' | 'below' | null;

export type Line = {
  name: 'required' | 'condonation';
  percent: number;
  met: boolean;
  canMiss: number;
  need: number | null;
  reachable: boolean | null;
};

export type OverviewItem = {
  timetableId: number;
  name: string;
  status: 'tracking' | 'setup';
  percent: number | null;
  percentText: string;
  zone: Zone;
  held: number;
  attended: number;
  required: Line | null;
};

export type ClassStatus = 'attended' | 'absent' | 'cancelled' | 'upcoming';

export type TodayClass = {
  timetableId: number;
  timetableName: string;
  tracking: boolean;
  date: string;
  key: string;
  slotId: number | null;
  extraId: number | null;
  subjectId: number;
  subjectName: string | null;
  shortName: string | null;
  colour: string | null;
  start: string;
  end: string;
  units: number;
  counts: boolean;
  status: ClassStatus;
};

export type Timetable = {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string | null;
  timeZone: string;
  requiredPercent: number | null;
  condonationPercent: number | null;
  archived: boolean;
  status: 'setup' | 'tracking';
  trackingStartedAt: string | null;
};

export type TimetableInput = {
  name: string;
  startsOn: string;
  endsOn: string | null;
  timeZone?: string;
  requiredPercent: number | null;
  condonationPercent: number | null;
};

export type SubjectKind = 'theory' | 'lab' | 'other';

export type Subject = {
  id: number;
  timetableId: number;
  name: string;
  shortName: string | null;
  kind: SubjectKind;
  countsAttendance: boolean;
  countPerSession: boolean;
  colour: string | null;
  archived: boolean;
};

export type SubjectInput = {
  name: string;
  shortName: string | null;
  kind: SubjectKind;
  countsAttendance: boolean;
  countPerSession: boolean;
  colour: string | null;
};

export type SetupStep = {
  key: 'dates' | 'subjects' | 'grid' | 'holidays';
  required: boolean;
  done: boolean;
  message: string;
};

export type Setup = { status: 'setup' | 'tracking'; ready: boolean; steps: SetupStep[] };

export type GridSlot = { id: number; weekday: number; start: string; end: string; periods: number; subjectId: number };

export type GridVersion = { id: number; effectiveFrom: string; effectiveUntil: string | null; slotCount: number };

export type Grid = { on: string; version: GridVersion | null; slots: GridSlot[] };

export type GridInput = {
  effectiveFrom: string;
  slots: Array<{ weekday: number; start: string; end: string; periods: number; subjectId: number }>;
  discardMarks?: boolean;
};

export type GridSaved = {
  version: GridVersion;
  slots: GridSlot[];
  summary: { created: boolean; kept: number; changed: number; added: number; removed: number; discardedMarks: number };
};

export type CalendarKind = 'holiday' | 'follows_weekday' | 'no_classes_before' | 'no_classes_after';

export type CalendarDay = {
  id: number;
  kind: CalendarKind;
  startsOn: string;
  endsOn: string;
  followsWeekday: number | null;
  cutoff: string | null;
  label: string | null;
};

export type CalendarDayInput = Omit<CalendarDay, 'id'>;

export type ImportPreview = {
  holidays: Array<{ startsOn: string; endsOn: string; label: string | null; source: string; warnings: string[]; problems: string[] }>;
  skipped: Array<{ line: number; text: string; reason: string }>;
};

export type Tally = {
  held: number;
  attended: number;
  missed: number;
  percent: number | null;
  percentText: string;
  remaining: number | null;
  best: number | null;
  bestText: string | null;
  lines: Line[];
};

export type SubjectTally = Tally & {
  subjectId: number;
  name: string;
  shortName: string | null;
  kind: SubjectKind;
  colour: string | null;
  archived: boolean;
  unitsPerClass: number;
};

export type Summary = {
  timetableId: number;
  status: 'setup' | 'tracking';
  asOf: { date: string; time: string };
  checkpoint: { asOf: string } | null;
  overall: Tally & { zone: Zone; freeHeld: number; freeAttended: number };
  subjects: SubjectTally[];
};

export type DayClass = {
  key: string;
  slotId: number | null;
  extraId: number | null;
  subjectId: number;
  scheduledSubjectId: number;
  start: string;
  end: string;
  units: number;
  counts: boolean;
  status: ClassStatus;
  plannedAbsent: boolean;
  cancelledBy: 'mark' | 'half_day' | null;
  beforeCheckpoint: boolean;
};

export type Day = {
  date: string;
  kind: 'outside' | 'holiday' | 'normal' | 'follows_weekday' | 'half_day';
  label: string | null;
  followsWeekday: number | null;
  tracking: boolean;
  classes: DayClass[];
};

export type Mark = { attendance: 'present' | 'absent' | 'cancelled'; substituteSubjectId: number | null };

export type ExtraInput = { subjectId: number; start: string; end: string; periods: number; attendance: 'present' | 'absent' };

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldErrors;

  constructor(status: number, code: string, message: string, fields: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export class NetworkError extends Error {
  constructor(message = "Can't reach attracker. Check your internet connection and try again.") {
    super(message);
    this.name = 'NetworkError';
  }
}

export type ApiMode = 'cookie' | 'token';

export type ApiOptions = {
  baseUrl: string;
  mode: ApiMode;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const fieldsFrom = (details: unknown): FieldErrors => {
  if (!Array.isArray(details)) return {};
  const fields: FieldErrors = {};
  for (const item of details) {
    if (!item || typeof item !== 'object') continue;
    const { field, message } = item as { field?: unknown; message?: unknown };
    if (typeof field === 'string' && typeof message === 'string' && !(field in fields)) fields[field] = message;
  }
  return fields;
};

const readBody = async (res: Response): Promise<unknown> => {
  if (res.status === 204) return undefined;
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
};

const AUTH_PATHS = new Set(['/auth/login', '/auth/signup', '/auth/google']);

export const createApi = (options: ApiOptions) => {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const client = options.mode === 'token' ? 'app' : 'web';

  const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = options.mode === 'token' ? options.getToken?.() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: options.mode === 'cookie' ? 'include' : 'omit',
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }

    const data = await readBody(res);
    if (res.ok) return data as T;

    const payload = (data ?? {}) as { error?: unknown; message?: unknown; details?: unknown };
    const code = typeof payload.error === 'string' ? payload.error : 'http_error';
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : res.status >= 500
          ? 'Something went wrong on our side. Try again in a minute.'
          : 'That did not work. Try again.';
    if (res.status === 401 && !AUTH_PATHS.has(path)) options.onUnauthorized?.();
    throw new ApiError(res.status, code, message, fieldsFrom(payload.details));
  };

  return {
    request,
    signup: (email: string, password: string) => request<AuthResult>('POST', '/auth/signup', { email, password, client }),
    login: (email: string, password: string) => request<AuthResult>('POST', '/auth/login', { email, password, client }),
    me: () => request<{ user: User }>('GET', '/auth/me').then((result) => result.user),
    logout: () => request<void>('POST', '/auth/logout'),
    logoutAll: () => request<void>('POST', '/auth/logout-all'),
    overview: () => request<{ timetables: OverviewItem[] }>('GET', '/overview').then((result) => result.timetables),
    today: () => request<{ classes: TodayClass[] }>('GET', '/today').then((result) => result.classes),
    createTimetable: (input: TimetableInput) => request<{ timetable: Timetable }>('POST', '/timetables', input).then((result) => result.timetable),
    timetable: (id: number) => request<{ timetable: Timetable }>('GET', `/timetables/${id}`).then((result) => result.timetable),
    updateTimetable: (id: number, changes: Partial<TimetableInput> & { archived?: boolean }) =>
      request<{ timetable: Timetable }>('PATCH', `/timetables/${id}`, changes).then((result) => result.timetable),
    deleteTimetable: (id: number) => request<void>('DELETE', `/timetables/${id}`),
    setup: (id: number) => request<Setup>('GET', `/timetables/${id}/setup`),
    startTracking: (id: number) => request<{ timetable: Timetable }>('POST', `/timetables/${id}/start`).then((result) => result.timetable),
    subjects: (id: number, includeArchived = false) =>
      request<{ subjects: Subject[] }>('GET', `/timetables/${id}/subjects${includeArchived ? '?archived=true' : ''}`).then((result) => result.subjects),
    createSubject: (id: number, input: SubjectInput) =>
      request<{ subject: Subject }>('POST', `/timetables/${id}/subjects`, input).then((result) => result.subject),
    updateSubject: (id: number, subjectId: number, changes: Partial<SubjectInput> & { archived?: boolean }) =>
      request<{ subject: Subject }>('PATCH', `/timetables/${id}/subjects/${subjectId}`, changes).then((result) => result.subject),
    summary: (id: number, asOf?: string) => request<{ summary: Summary }>('GET', `/timetables/${id}/summary${asOf ? `?asOf=${asOf}` : ''}`).then((result) => result.summary),
    day: (id: number, date: string) => request<{ day: Day }>('GET', `/timetables/${id}/days/${date}`).then((result) => result.day),
    mark: (id: number, date: string, slotId: number, mark: Mark) =>
      request<{ day: Day }>('PUT', `/timetables/${id}/days/${date}/classes/${slotId}`, mark).then((result) => result.day),
    clearMark: (id: number, date: string, slotId: number) => request<{ day: Day }>('DELETE', `/timetables/${id}/days/${date}/classes/${slotId}`).then((result) => result.day),
    addExtra: (id: number, date: string, extra: ExtraInput) => request<{ day: Day }>('POST', `/timetables/${id}/days/${date}/extra`, extra).then((result) => result.day),
    updateExtra: (id: number, extraId: number, changes: Partial<ExtraInput>) =>
      request<{ day: Day }>('PATCH', `/timetables/${id}/extra/${extraId}`, changes).then((result) => result.day),
    deleteExtra: (id: number, extraId: number) => request<{ day: Day }>('DELETE', `/timetables/${id}/extra/${extraId}`).then((result) => result.day),
    grid: (id: number, on?: string) => request<Grid>('GET', `/timetables/${id}/grid${on ? `?on=${on}` : ''}`),
    saveGrid: (id: number, input: GridInput) => request<GridSaved>('PUT', `/timetables/${id}/grid`, input),
    calendar: (id: number) => request<{ days: CalendarDay[] }>('GET', `/timetables/${id}/calendar`).then((result) => result.days),
    addDay: (id: number, input: CalendarDayInput) => request<{ day: CalendarDay }>('POST', `/timetables/${id}/calendar`, input).then((result) => result.day),
    addDays: (id: number, days: CalendarDayInput[]) => request<{ days: CalendarDay[] }>('POST', `/timetables/${id}/calendar/bulk`, { days }).then((result) => result.days),
    updateDay: (id: number, dayId: number, input: CalendarDayInput) =>
      request<{ day: CalendarDay }>('PATCH', `/timetables/${id}/calendar/${dayId}`, input).then((result) => result.day),
    deleteDay: (id: number, dayId: number) => request<void>('DELETE', `/timetables/${id}/calendar/${dayId}`),
    previewImport: (id: number, text: string) => request<ImportPreview>('POST', `/timetables/${id}/calendar/import`, { text }),
    deleteSubject: (id: number, subjectId: number) => request<void>('DELETE', `/timetables/${id}/subjects/${subjectId}`),
  };
};

export type Api = ReturnType<typeof createApi>;
