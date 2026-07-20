# Схема площадки (Maps) — контракт API

**Статус:** заморожен для Sprint 3 (`planned` — на момент фиксации ещё не реализован в `backend-java`).
**Машинный контракт:** [`docs/openapi-maps.yaml`](openapi-maps.yaml) (OpenAPI 3.0.3 — открывается в Swagger UI).
**Источник требований:** спека «Схема площадки (v2)».

Цель фичи: компания загружает изображение плана площадки, человек вручную обводит зоны
полигонами (редактор на Konva), каждой зоне назначается ответственный, команда в реальном
времени отмечает статус готовности. При статусе «Проблема» админ компании получает алерт.
Данные строго изолированы по компаниям.

> Разметка зон — **ручная** (полигоны поверх растровой подложки). AI (DeepSeek/HF) в контур
> этого контракта не входит: PNG→SVG и авто-нарезка комнат вынесены из скоупа.

---

## 1. Конвенции (как во всём StreamDesk)

- Базовый префикс: `/api`. Формат — JSON, кроме загрузки файлов (`multipart/form-data`).
- **Авторизация:** серверная сессия (cookie `connect.sid`), принципал — `AuthenticatedUser`.
  Все операции требуют доступа к рабочему пространству (`hasWorkspaceAccess`).
- **Мультитенантность:** каждая сущность несёт `companyId`. Сервер фильтрует всё по компании
  текущего пользователя. Обращение к чужой сущности → `404` (не раскрываем существование).
- **Модель ошибки:** `{ "message": "…" }` + HTTP-статус (как `GlobalExceptionHandler`).
- **Оптимистичная блокировка:** у зоны есть `version`; изменяющие запросы принимают текущую
  `version`. Рассинхрон → `409 Conflict`. Realtime-конфликты: last-write-wins + `version`.
- **Время:** ISO-8601 UTC. **Идентификаторы:** строковые UUID.

---

## 2. Модель данных

### Map (карта / план площадки)
| Поле | Тип | Примечание |
|---|---|---|
| `id` | string (uuid) | |
| `companyId` | string | изоляция |
| `venueId` | string \| null | площадка (для нескольких карт на площадку — stretch) |
| `name` | string | напр. «Главный зал, 1 этаж» |
| `imageUrl` | string \| null | ссылка на загруженную подложку |
| `imageWidth` | int \| null | пиксели оригинала (для координат зон) |
| `imageHeight` | int \| null | |
| `zonesCount` | int | денормализовано для списка |
| `statusCounts` | map<ZoneStatus, int> | **только в `GET /api/maps`**; все шесть статусов, в т.ч. нулевые |
| `unassignedCount` | int | **только в `GET /api/maps`**; зон без ответственного |
| `assignees` | MapAssignee[] | **только в `GET /api/maps`**; без дублей, с именами |
| `zoneNames` | string[] | **только в `GET /api/maps`**; для поиска по зоне в списке |
| `createdBy` | string | |
| `createdAt` / `updatedAt` | string (date-time) | |

Поля сводки нужны карточке площадки в списке: готовность зон, проблемы и ответственные должны
быть видны **до** перехода в редактор. В ответе одной карты (`MapWithZones`) они опущены — там
есть полный `zones`, из которого то же самое считается на клиенте. Зоны всех карт читаются одним
запросом-проекцией, ответственные — одним `findAllById`, поэтому число SQL-запросов не растёт с
числом карт.

`MapAssignee`: `{ id, name?, avatar? }` — имя приходит сразу, чтобы список не обращался к
`/api/users` (он доступен не всем ролям).

### Zone (зона)
| Поле | Тип | Примечание |
|---|---|---|
| `id` | string (uuid) | |
| `mapId` | string | |
| `companyId` | string | |
| `name` | string | |
| `points` | `[{x:number,y:number}, …]` | полигон в координатах изображения (≥ 3 точки) |
| `status` | enum | см. §3 |
| `assigneeId` | string \| null | userId ответственного |
| `assigneeType` | `"user"` \| `"team"` \| null | |
| `color` | string \| null | переопределение цвета (иначе — по статусу) |
| `version` | int | оптимистичная блокировка |
| `commentsCount` / `photosCount` | int | |
| `createdBy`, `createdAt`, `updatedAt` | | |

### ZoneStatusHistory / ZoneComment / ZonePhoto
- **StatusHistoryEntry:** `id, zoneId, fromStatus, toStatus, changedBy, changedAt`.
- **ZoneComment:** `id, zoneId, authorId, text, createdAt`.
- **ZonePhoto:** `id, zoneId, url, uploadedBy, createdAt` (+ опц. `width/height`).

---

## 3. Статусы зоны (state machine)

Шесть состояний (значение API → подпись → цвет-подсказка для легенды):

| API | Подпись | Цвет |
|---|---|---|
| `not_started` | Не начато | серый |
| `in_progress` | В работе | жёлтый |
| `done` | Готово | зелёный |
| `needs_review` | Требует проверки | синий |
| `problem` | Проблема | красный (акцент/пульсация) |
| `verified` | Проверено | тёмно-зелёный |

**Допустимые переходы** (сервер валидирует; иначе `409`):

```
not_started  → in_progress
in_progress  → done | needs_review | problem
done         → needs_review | verified | problem
needs_review → verified | in_progress | problem
verified     → in_progress | problem          (переоткрытие)
problem      → in_progress | done              (после устранения)
```

> В `problem` можно перейти из **любого** статуса (флаг проблемы всегда разрешён).
> Переход в `problem` триггерит алерт (§6).

---

## 4. REST-эндпоинты

Все пути под `/api`, требуют сессии и доступа к workspace; ответы отфильтрованы по компании.

### Карты и план
| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/maps` (опц. `?venueId=`) | список карт компании |
| `POST` | `/api/maps` | создать карту (метаданные: `name`, `venueId?`) |
| `GET` | `/api/maps/{mapId}` | карта с планом и списком зон |
| `PUT` | `/api/maps/{mapId}` | переименовать / обновить метаданные |
| `DELETE` | `/api/maps/{mapId}` | удалить карту и её зоны |
| `POST` | `/api/maps/{mapId}/plan` | ✅ **загрузить подложку** (`multipart`, `file`); вернёт `imageUrl,width,height` |

### Зоны
| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/maps/{mapId}/zones` | **список зон карты** |
| `POST` | `/api/maps/{mapId}/zones` | **создать зону** (`name`, `points[]`, `status?`) |
| `GET` | `/api/maps/{mapId}/zones/{zoneId}` | одна зона (с ответственным/счётчиками) |
| `PUT` | `/api/maps/{mapId}/zones/{zoneId}` | **изменить** имя/геометрию (`version`) |
| `DELETE` | `/api/maps/{mapId}/zones/{zoneId}` | **удалить зону** |
| `PATCH` | `/api/maps/{mapId}/zones/{zoneId}/status` | **сменить статус** (`status`, `version`) → пишет историю |
| `GET` | `/api/maps/{mapId}/zones/{zoneId}/status-history` | история смен статуса |
| `PUT` | `/api/maps/{mapId}/zones/{zoneId}/assignee` | **назначить ответственного** (`assigneeId`, `assigneeType`) или снять (`null`) |

### Комментарии и фото зоны
| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/api/maps/{mapId}/zones/{zoneId}/comments` | список комментариев |
| `POST` | `/api/maps/{mapId}/zones/{zoneId}/comments` | добавить комментарий (`text`) |
| `DELETE` | `/api/maps/{mapId}/zones/{zoneId}/comments/{commentId}` | удалить комментарий (автор/админ) |
| `GET` | `/api/maps/{mapId}/zones/{zoneId}/photos` | список фото |
| `POST` | `/api/maps/{mapId}/zones/{zoneId}/photos` | **прикрепить фото** (`multipart`, `file`) |
| `DELETE` | `/api/maps/{mapId}/zones/{zoneId}/photos/{photoId}` | удалить фото |

**Коды ответов:** `200/201` — успех; `400` — валидация (напр. < 3 точек полигона);
`401` — нет сессии; `403` — нет доступа к workspace; `404` — нет сущности / чужая компания;
`409` — конфликт версий или недопустимый переход статуса; `413` — файл слишком большой;
`415` — неверный тип файла; `500` — внутренняя ошибка.

**Ограничения файлов (предложение, подтвердить):** план — PNG/JPG ≤ 20 МБ; фото зоны —
PNG/JPG ≤ 10 МБ.

---

## 5. Realtime (WebSocket)

Канал на одну карту; переиспользует механизм комнат канбана.

- **Подключение:** `WS /ws/maps/{mapId}` (та же сессия/cookie; сервер проверяет компанию).
- **Клиент → сервер:** `join`, `leave`, `presence` (heartbeat).
- **Сервер → клиентам комнаты** (события):

| Событие | Payload (кратко) |
|---|---|
| `zone.created` | `{ zone }` |
| `zone.updated` | `{ zone }` (геометрия/имя, новый `version`) |
| `zone.deleted` | `{ zoneId }` |
| `zone.status_changed` | `{ zoneId, fromStatus, toStatus, changedBy, version }` |
| `zone.assignee_changed` | `{ zoneId, assigneeId, assigneeType }` |
| `zone.comment_added` | `{ zoneId, comment }` |
| `zone.photo_added` | `{ zoneId, photo }` |
| `presence.update` | `{ users: [{ id, name }] }` — кто сейчас на карте |
| `alert.problem` | `{ mapId, zone, markedBy }` — дублирует алерт (§6) |

Конфликты одновременной правки: **last-write-wins + `version`**; клиент со stale-версией
получает актуальное состояние в ответном событии.

> **Реализация в `backend-java`.** Транспорт — **STOMP-over-WebSocket** поверх SockJS: точка
> рукопожатия `WS /ws`, комната карты — топик `/topic/maps/{mapId}`. Каждое событие приходит
> конвертом `{ type, payload }` (`type` — вид события из таблицы выше, `payload` — его тело).
> Аутентификация берётся из той же HttpSession, что и REST (cookie `streamdesk.sid`), на
> рукопожатии; изоляция компаний проверяется на `SUBSCRIBE` (чужая/несуществующая карта →
> подписка отклоняется). **Presence** ведётся по WS-сессиям с дедупом по `userId` (несколько
> вкладок одного пользователя = один участник): `presence.update` рассылается при изменении
> состава на подписке/отписке/дисконнекте. Реконнект восстанавливает состояние обычным
> `GET /api/maps/{mapId}` (last-write-wins + `version` уже покрывают гонки).

---

## 6. Алерт «Проблема»

Как только зона переходит в `problem`, всем **администраторам компании** отправляется
уведомление через существующий модуль нотификаций (`GET /api/notifications`) + WS-событие
`alert.problem`. Уведомление содержит: карту, зону, кто пометил. Канал email — открытый
вопрос (см. §8).

---

## 7. Изоляция компаний (обязательно тестировать)

Любой запрос к `maps/*` фильтруется по `companyId` пользователя. Пользователь компании A
физически не может прочитать/изменить карты, зоны, комментарии и фото компании B — ответ
`404`. Это критический инвариант с явными тестами (аналогично `VisibilityE2ETest` для задач).

---

## 8. Открытые вопросы (зафиксировать в день 0)

1. Каналы алерта при «Проблеме»: только in-app или ещё email/push? (email — +1 день BE.)
2. Целевое число одновременных пользователей на карте для нагрузочного (5 / 50 / 500?).
3. Несколько планов на одну площадку — сразу (`venueId` + переключение) или одна карта на старте?
4. Экспорт схемы со статусами в PDF/картинку — в этот спринт или stretch?
5. Редактирование вершин уже нарисованного полигона — в базовый скоуп или в конце/stretch?

---

## 9. Соответствие задачам спринта

`VM-01` модель БД · `VM-03` этот контракт · `VM-04` `POST /maps/{id}/plan` ·
`VM-05` CRUD зон · `VM-06`/`VM-13` WebSocket (§5) · `VM-12` статусы + история (§3) ·
`VM-14` назначение ответственного · `VM-15` алерт (§6) · `VM-16` комментарии/фото.
