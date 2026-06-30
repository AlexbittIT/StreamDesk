# E2E Scenarios

End-to-end scenarios for the live modules: connection schemas, estimates, personnel
(role visibility), tasks, events. Each scenario: steps, expected result, data.
Labels: **Happy** (main path), **Edge** (boundary case), **Error** (failure case).

> Known gap: `POST /api/estimates/analyze` is called by the frontend but has **no
> implementation in `backend-java/`**. So "Build estimate" (TZ → AI) currently fails.
> Estimate scenarios mark this; catalog/shifts/delivery/Excel/export-to-schema work
> independently.

## Roles

Global `user.role`: `admin`, `manager`, else `member`. Tab access via `tab:<key>`
permissions (`shared/schema.ts`). Extras: platform owner (`platform:admin`), company
admin panel, Terminal tab by role list (`GET /api/terminal/access`).

---

## 1. Connection schemas (done — reference module)

- **Happy — create + valid link.** Create schema, add `Sony camera` (HDMI OUT) and
  `ATEM Mini` (HDMI IN 1..4), drag link OUT→IN. Expected: link marked valid, saved via
  `PUT /api/connection-schemas/components/{id}`, survives reload.
- **Edge — incompatible link.** Connect `XLR OUT` to `HDMI IN`. Expected: marked
  incompatible, link blocked or warned.
- **Error — AI generation without DeepSeek key.** Expected: server `503`, clear message,
  existing schema untouched.

## 2. Estimates: TZ → AI → match → shifts → Excel

Page `frontend/src/pages/estimates.tsx`. Catalog from `GET /api/equipment`; analysis via
`POST /api/estimates/analyze` (multipart: title, text, file, shift params).

- **Happy/Error — TZ → estimate.** Data: TZ text "1-day conference: 3 cameras, mixer + 4
  wireless mics, 2 screens, switching/network, record + stream"; shifts start
  `2026-07-10 08:00`, end `20:00`, 10h/shift. Click "Build estimate".
  Expected (target): grouped lines, subtotal, source badge, shift block, auto-saved to
  history. Expected (current): `analyze` endpoint missing → toast "Failed to build
  estimate". Treat as defect, not correct behavior.
- **Edge — analyze from file.** Upload `tz.docx`, empty text. Expected: `file` in
  FormData, response `document {name, extractedChars}` shown. (Same Error if no backend.)
- **Error — empty input.** Clear text and file. Expected: "Build estimate" disabled,
  no request (client-side, backend-independent).
- **Happy — manual catalog build (works without analyze).** Search `camera` → add `+` →
  set qty `3`. Expected: line added, `baseTotal = qty × unitPrice`,
  `total = baseTotal × shiftFactor`, totals/grouping recompute live.
  - **Edge — shortage:** `availableQty < qty` → availability `partial/unavailable`,
    "Shortage" counter rises.
  - **Edge — no price:** `unitPrice=0` → amber field, "No price" counter, zero-cost banner.
- **Happy — shifts/coefficients.** Start `2026-07-11 08:00` (Sat), end `2026-07-12 02:00`,
  default coeffs, holiday date `2026-07-11`. Expected: weekend day/night segments with
  hours/shifts/coeff, header shows `chargeableShifts` and `chargeFactor`; overlap of a
  date in both holiday and workday lists → warning.
  - **Edge — manual mode:** clear dates, "Shifts manual" `2`. Source `manual`, no
    date-based segments.
- **Happy — delivery.** 30 units, distance `45 km`. Expected: `vehicles=ceil(30/14)=3`,
  hours = load+drive, sum by formula; grand total = equipment + delivery.
  - **Edge — empty estimate / 0 km:** vehicles 0, delivery 0.
- **Happy — Excel export.** ≥1 line, click "Excel". Expected: `<title>_<date>.xls`
  downloads (HTML table, UTF-8 + BOM): grouped subtotals, qty/avail/price/base/coeff/sum,
  shift block, delivery row, "Not found in stock" table. Cyrillic intact.
  - **Error — no lines:** "Excel" disabled.
- **Happy — export to schemas.** Estimate has equipment (labor/transport/cable/power
  excluded, see `shouldExportToSchema`). Click "To schemas". Expected: creates schema +
  zones + components, builds links (mics→mixer, cameras→video hub, light→console,
  hubs→network), toast + redirect to `/connection-schemas?schema=<id>`. Cap 8 copies/line.
  - **Error — schema create fails:** no `id` returned → toast "Failed to create schema",
    no redirect.
- **Happy — version history.** Save version → Open → Delete. Expected: localStorage (≤40),
  open restores estimate/title/distance. Note: local to browser, not synced (limitation).

## 3. Personnel: visibility by role

Source: `components/layout/sidebar.tsx`, `bottom-nav.tsx`, `shared/schema.ts`,
`GET /api/terminal/access`.

- **Happy — member.** Permissions include only some `tab:*` (dashboard, tasks, equipment).
  Expected: only allowed tabs visible; service nav hidden; role label "Сотрудник".
  - **Error — direct nav:** open `/platform-admin` manually → access denied, no data.
- **Happy — manager.** Manager/company panel available (`canViewCompanyAdmin`), label
  "Менеджер"; platform sections hidden.
- **Happy — admin.** All tabs (admin defaults to `true` when no `tab:*`), company panel;
  platform only with `platform:admin`.
- **Happy — platform owner.** `admin` + `platform:admin` → owner mode: primary nav
  collapses to Settings, platform menu shown, label "Владелец платформы".
- **Edge — Terminal by role list.** `GET /api/terminal/access` returns `allowedRoles`
  with user role → Terminal shown; otherwise hidden (incl. request error → `[]`).
- **Happy — multitenancy.** Two users, different companies. Expected: each sees only own
  company data (equipment, tasks, estimates, schemas).
- **Happy — production persons.** Separate module (`pages/production.tsx`, photo via
  `POST /api/production/upload-photo`): create person with role `Ведущий`, upload photo,
  export card. Access gated by `tab:production`.

## 4. Tasks (kanban)

Page `pages/tasks.tsx`; API `/api/tasks` (`TaskController`). Permissions:
`tasks:view/create/edit/delete/assign`.

- **Happy — create + move.** Create `Prepare venue` (todo) → drag todo → in_progress →
  done. Expected: `PUT /api/tasks/{id}` updates status, `GET /{id}/history` logs moves.
- **Happy — comments + history.** Add then delete comment (`/{taskId}/comments`).
  Expected: appears/removed, reflected in history.
- **Edge — assign without `tasks:assign`.** Assign action hidden; API rejects.
- **Error — delete without `tasks:delete`.** Delete hidden; direct `DELETE` rejected,
  task remains.
- **Edge — YouGile sync.** With `YOUGILE_API_KEY` boards/tasks pull in
  (`tasks-yougile.tsx`); without key, local-only mode, no crash.

## 5. Events

API `/api/events` (`EventController`); participants `/{eventId}/participants`.
Permissions: `events:view/create/edit/delete`. Linked to calendar and vMix scheduler
(`vmix_scheduler_events`).

- **Happy — create + participants.** `Broadcast rehearsal`, `2026-07-10 09:00–18:00`,
  add participants. Expected: shows in list/calendar, participants linked, edit/delete work.
- **Edge — no end date.** Only start set. Expected: created (`end_time` nullable), renders
  in calendar.
- **Happy — vMix scheduler event.** `vmix_host/port` set, action = switch input, status
  `scheduled`. At `start_time`: status `scheduled → executed`, `executed_at` set.
  - **Error — vMix unreachable:** status error, `error_message` filled, other events
    not blocked.
- **Error — events without `events:view`.** List/tab unavailable, data not served.

## 6. Traceability & Lead sign-off

Fill task IDs at acceptance.

| Module | Scenarios | Task / AC | Status |
|--------|-----------|-----------|--------|
| Schemas (done) | §1 | `TASK-___` | done |
| Estimates | §2 | `TASK-___` | pending (see analyze gap) |
| Personnel/roles | §3 | `TASK-___` | pending |
| Tasks | §4 | `TASK-___` | pending |
| Events | §5 | `TASK-___` | pending |

Lead sign-off:
- [ ] Scope "main paths + errors/edge cases" confirmed.
- [ ] Live-module list confirmed (flag unfinished, esp. `POST /api/estimates/analyze`).
- [ ] Each group linked to a task ID and its AC.
- [ ] Decision on estimate defect: implement analyze endpoint or exclude §2 TZ→AI paths.

Open questions: (1) implement or document `analyze` gap; (2) estimate history is
localStorage-only — need server persistence? (3) add scenarios for adjacent modules
(equipment/booking/monitoring/streams) or out of scope?
