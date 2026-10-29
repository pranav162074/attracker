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

```
npm ci
cp api/.env.example api/.env
npm run dev
```

The API listens on http://localhost:4000. `GET /health` answers `{"status":"ok"}`.

Use `npm ci` rather than `npm install`, so the lockfile is not rewritten.

## Checks

```
npm run lint
npm run typecheck
npm test
```

GitHub Actions runs all three on every pull request.
