# attracker

Attendance tracking for students. Enter your timetable and academic calendar once, and attracker works out your attendance for every subject and lab, and overall, from day one. Every class counts as attended until you mark it otherwise, and everything stays editable: absences, cancelled classes, extra classes, sudden holidays, half days, and Saturdays that follow another day's timetable. Track several timetables side by side, such as college, tuition and dance.

Work in progress.

## Layout

```
engine/   the attendance rules and the holiday parser, shared by the API and the app (TypeScript, no dependencies)
api/      the HTTP API (Node, Express)
```

## Running it

Node.js 24 is recommended (22.18 or later works). The TypeScript source runs directly on Node, with no build step.

npm 11.5.0 to 11.6.0 skip the platform-specific packages the test runner needs, so `npm ci` refuses to run on them. Update npm with `npm install -g npm@latest` if it does.

You need a PostgreSQL database. Neon's free plan works: create a project, then copy its pooled connection string into `DATABASE_URL` and its direct one into `DIRECT_URL` in `api/.env`.

```
npm ci
cp api/.env.example api/.env
npm run migrate -w @attracker/api
npm run dev
```

The API listens on http://localhost:4000. `GET /health` answers `{"status":"ok"}` without touching the database, so health checks never keep it awake. `GET /ready` also checks the database.

Use `npm ci` rather than `npm install`, so the lockfile is not rewritten.

## Checks

```
npm run lint
npm run typecheck
npm test
```

The database tests need a migrated PostgreSQL on this machine (set `DATABASE_URL` to it before `npm test`); without one they are skipped locally. They refuse to run against anything but `localhost`, because they create and delete data. GitHub Actions runs everything on every pull request against its own PostgreSQL, including applying, rolling back and reapplying the migrations.

## API

| Method | Path | What it does |
|---|---|---|
| POST | `/auth/signup` | Create an account and log in (`{ email, password, client }`) |
| POST | `/auth/login` | Log in |
| POST | `/auth/google` | Continue with Google (`{ idToken, client }`) |
| GET | `/auth/me` | The logged-in user, with their sign-in methods |
| POST | `/auth/logout` | Log out this device |
| POST | `/auth/logout-all` | Log out every device |
| GET | `/timetables` | Your timetables (`?archived=true` includes archived ones) |
| POST | `/timetables` | Create one (`{ name, startsOn, endsOn?, timeZone?, requiredPercent?, condonationPercent? }`) |
| GET, PATCH, DELETE | `/timetables/{id}` | Show, change (including `archived`), or delete with everything in it |
| GET | `/timetables/{id}/setup` | Checklist of what is filled in, and whether tracking can start |
| POST | `/timetables/{id}/start` | Start tracking |
| GET, POST | `/timetables/{id}/subjects` | List (`?archived=true` for all) or add subjects |
| PATCH, DELETE | `/timetables/{id}/subjects/{subjectId}` | Change, archive, or delete an unused subject |
| GET | `/timetables/{id}/grid` | The weekly grid in effect today, or on `?on=YYYY-MM-DD` |
| PUT | `/timetables/{id}/grid` | Save a grid from a date (`{ effectiveFrom, slots, discardMarks? }`) |
| GET | `/timetables/{id}/grid/versions` | Every version with the dates it covers |
| DELETE | `/timetables/{id}/grid/versions/{versionId}` | Remove a version |
| GET, POST | `/timetables/{id}/calendar` | List (`?from=&to=`) or add holidays, breaks, half days and swapped days |
| POST | `/timetables/{id}/calendar/bulk` | Add many at once, all or nothing |
| POST | `/timetables/{id}/calendar/import` | Read a pasted holiday list and preview it, without saving |
| PATCH, DELETE | `/timetables/{id}/calendar/{dayId}` | Change or remove an entry |
| GET | `/health` | Liveness, without touching the database |
| GET | `/ready` | Readiness, including the database |

`client` is `web` (the default) or `app`. The website gets an `HttpOnly`, `SameSite=Lax` session cookie, `Secure` in production. The phone app gets a token in the response and sends it as `Authorization: Bearer <token>`. Sessions last 60 days and are extended while in use; only a SHA-256 hash of each token is stored.

Passwords are hashed with scrypt (N = 32768), and the parameters are stored with each hash so they can be raised later without breaking old ones. A wrong password and an unknown email get the same answer.

Continue with Google takes the ID token the website or app gets from Google. The API checks it with Google's own library: signature against Google's published keys, issuer, expiry, that it was issued for one of `GOOGLE_CLIENT_IDS`, and that the email is verified. The first sign-in creates an account without a password; if an account with that email already exists, Google is linked to it, so both ways of signing in reach the same account.

A timetable begins in setup. The student enters the semester dates, the subjects, the weekly timetable and their college's holidays, then presses Start Tracking. Tracking needs at least one subject that counts for attendance and a weekly timetable covering the first day of the semester; holidays are optional because not every timetable has them. Attendance then counts from the semester's start date with every class present by default, and everything stays editable afterwards.

Everything under `/timetables` belongs to the logged-in user. Someone else's timetable answers 404, exactly like one that does not exist, so ids reveal nothing. A user can have up to 20 active timetables; archived ones do not count and free their name. Percentages are stored as whole hundredths (75.5% is 7550), so no rounding creeps in.

A subject is `theory`, `lab` or `other`. Subjects of kind `other` (library, sports, counselling) do not count toward attendance unless told to, and any subject can count per session instead of per period, for things like a weekly dance class. New subjects get the least-used colour of a 12-colour palette. A subject that the timetable uses or that has attendance history cannot be deleted, only archived, so no history is lost.

The grid is versioned. Saving a grid from a new date starts a new version, and the earlier weeks keep the schedule they had. Saving again on an existing version's date edits it in place: classes are matched to the existing ones first by day and time, then by day and subject, so a corrected subject, a shifted time or a swap keeps each class and its attendance marks. A save that would remove classes holding marks is refused with a list of them unless `discardMarks` is set. Overlaps within a day are reported by name, and the database checks them again at the end of each save, which lets a whole block of classes move at once.

Calendar entries are `holiday` (one day or a range, such as mid exams), `follows_weekday` (a Saturday following Monday's timetable, or a swapped day), and half days (`no_classes_before` or `no_classes_after` a time). Each day has at most one entry; a clash is reported with what is already there. The holiday import reads lists copied out of an academic calendar PDF, including two columns that end up on one line, in `DD.MM.YYYY`, `DD/MM/YY`, `YYYY-MM-DD` and range forms. It warns when a written weekday does not match its date, and flags dates outside the timetable or already taken. The parser lives in `engine/`, so the app can preview a paste offline.

Requests that change something with a cookie must come from an allowed origin (`ALLOWED_ORIGINS`), so other sites cannot act on a logged-in browser's behalf. Sign-ups are limited to 5 an hour per address, and logins to 30 per 15 minutes per address and 10 per 15 minutes per account, counted in PostgreSQL.

| Setting | Default | What it is |
|---|---|---|
| `DATABASE_URL` | (required) | Pooled PostgreSQL connection |
| `DIRECT_URL` | `DATABASE_URL` | Direct connection, for migrations |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | 4000, info, development | The usual |
| `TRUST_PROXY` | 0 | How many proxies sit in front of the API; decides the client address used for limits |
| `ALLOWED_ORIGINS` | `http://localhost:8081,http://localhost:4000` | Sites allowed to make cookie-authenticated changes |
| `SESSION_DAYS` | 60 | How long an unused session lasts |
| `GOOGLE_CLIENT_IDS` | (empty: Google sign-in off) | Comma-separated OAuth client IDs (web, Android) whose tokens are accepted |

## Data model

Only rules and exceptions are stored; each individual class is worked out from them when needed.

| Table | Holds |
|---|---|
| `users`, `sessions` | accounts and logged-in devices |
| `user_identities` | linked Google accounts |
| `rate_limit_windows` | sign-up and login attempt counters |
| `timetables` | name, dates, time zone, required and condonation lines |
| `subjects` | name, theory or lab, whether it counts, per period or per session |
| `grid_versions`, `grid_slots` | the weekly grid, with a new version from any date |
| `calendar_days` | holidays, breaks, half days, days that follow another weekday |
| `class_marks` | absent, cancelled or substituted classes (present is the default and never stored) |
| `extra_classes` | classes added outside the grid |
| `checkpoints`, `checkpoint_subjects` | official held and attended numbers on a date |

The database enforces the rules itself: no two classes at overlapping times on the same day, one calendar rule per day, nothing pointing at another timetable's subjects or classes, never more attended than held, and a slot that still holds your marks cannot be deleted.
