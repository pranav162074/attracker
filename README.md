# attracker

Attendance tracking for students. Enter your timetable and academic calendar once, and attracker works out your attendance for every subject and lab, and overall, from day one. Every class counts as attended until you mark it otherwise, and everything stays editable: absences, cancelled classes, extra classes, sudden holidays, half days, and Saturdays that follow another day's timetable. Track several timetables side by side, such as college, tuition and dance.

Work in progress.

## Layout

```
engine/   the attendance rules, shared by the API and the app (TypeScript, no dependencies)
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

## Data model

Only rules and exceptions are stored; each individual class is worked out from them when needed.

| Table | Holds |
|---|---|
| `users`, `sessions` | accounts and logged-in devices |
| `timetables` | name, dates, time zone, required and condonation lines |
| `subjects` | name, theory or lab, whether it counts, per period or per session |
| `grid_versions`, `grid_slots` | the weekly grid, with a new version from any date |
| `calendar_days` | holidays, breaks, half days, days that follow another weekday |
| `class_marks` | absent, cancelled or substituted classes (present is the default and never stored) |
| `extra_classes` | classes added outside the grid |
| `checkpoints`, `checkpoint_subjects` | official held and attended numbers on a date |

The database enforces the rules itself: no two classes at overlapping times on the same day, one calendar rule per day, nothing pointing at another timetable's subjects or classes, never more attended than held, and a slot that still holds your marks cannot be deleted.
