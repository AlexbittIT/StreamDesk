# AI-вызовы в модуле смет StreamDesk


## TL;DR

1. **Модуль смет НЕ использует DeepSeek.** Он вызывает либо **OpenAI**
   (`api.openai.com`, приоритет), либо **Hugging Face router**
   (`router.huggingface.co`). Модель HF по умолчанию — `openai/gpt-oss-20b`.
2. **DeepSeek — это отдельная фича** «AI диагностика» на странице platform-admin
   (кнопка «DeepSeek глубоко»). И она **сломана**: фронтенд дёргает
   `POST /api/platform/ops-ai/analyze`, а такого маршрута в backend нет → 404.
   Вероятнее всего, жалоба «криво работает вызов ИИ» относится именно к этому.
3. Фронтенд смет шлёт `requireAi` и параметры смен, которые **backend игнорирует**
   и всегда возвращает `shiftCalculation: null`, `aiSchedule: null`.

---

## Часть 1. Полный flow модуля смет

### Шаг 1. Пользователь нажимает кнопку
Кнопка **«Собрать смету»** — `frontend/src/pages/estimates.tsx:939`:

```tsx
<Button type="button" disabled={!canAnalyze} onClick={() => analyzeMutation.mutate()}>
  Собрать смету
</Button>
```

### Шаг 2. Frontend формирует запрос
`analyzeMutation` — `frontend/src/pages/estimates.tsx:610-648`. Собирается `FormData`
и отправляется на `POST /api/estimates/analyze` (`estimates.tsx:630`):

```tsx
formData.append("title", title);
formData.append("text", tzText);
formData.append("requireAi", "true");
formData.append("startAt", startAt);          // ← backend игнорирует
formData.append("endAt", endAt);              // ← backend игнорирует
formData.append("manualShiftCount", ...);     // ← backend игнорирует
// + ещё ~10 параметров смен/коэффициентов — все игнорируются backend
if (file) formData.append("file", file);
```

### Шаг 3. Backend обрабатывает запрос
Маршрут `POST /api/estimates/analyze` — `backend/routes.ts:6590`.

1. Читает только `title`, `text`, `file` (остальной FormData игнорируется).
2. Сначала собирает смету **эвристикой без AI**: правила по ключевым словам,
   внутренняя база цен `estimatePriceGuide`, продакшн-блоки — `routes.ts:6600-6660`.
3. Затем **выбирает AI-провайдера** — `routes.ts:6661-6671`:

```ts
const openAiKey = process.env.OPENAI_API_KEY || "";
const hfKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
const apiKey = openAiKey || hfKey;
...
const aiItems = openAiKey
  ? await callOpenAiEstimateAssistant(openAiKey, title, text, equipment)   // приоритет
  : await callHfEstimateAssistant(hfKey, title, text, equipment);
aiProvider = openAiKey ? "openai" : "huggingface";
```

**Логика выбора:** есть `OPENAI_API_KEY` → OpenAI. Иначе есть
`HUGGINGFACE_API_KEY`/`HF_TOKEN` → Hugging Face. Нет ключей → только эвристика
(`source: "heuristic"`).

### Шаг 4. Что возвращает API
AI отвечает JSON по схеме `{"items":[...]}`. Backend:
- парсит первый `{...}`-блок регуляркой (`routes.ts:6523`, `6581`);
- при ошибке парсинга молча возвращает `[]`;
- AI-позиции добавляются к эвристическим с дедупликацией по первым 14 символам
  имени (`routes.ts:6672-6682`);
- финальный ответ (`routes.ts:6697-6720`) — `source: "ai" | "heuristic"`, `items`,
  `missing`, `warnings`, `totals`, `catalogStats`, и **всегда**
  `shiftCalculation: null`, `aiSchedule: null`.

### Шаг 5. Что отображается
`onSuccess` (`estimates.tsx:633`) кладёт результат в стейт, сохраняет версию и
показывает toast. Бейдж источника: `«ИИ»` или `«Локальный анализ»` в зависимости
от `source` (`estimates.tsx:1141`).

---

## Часть 2. Точки вызова API (файлы и строки)

| Что | Файл:строка | Endpoint / модель |
|---|---|---|
| Кнопка «Собрать смету» | `estimates.tsx:939` | → `analyzeMutation` |
| Отправка запроса | `estimates.tsx:630` | `POST /api/estimates/analyze` |
| Backend-маршрут | `routes.ts:6590` | — |
| Выбор провайдера | `routes.ts:6661-6671` | OpenAI **или** HF |
| **Вызов Hugging Face** | `routes.ts:6492` | `POST https://router.huggingface.co/v1/chat/completions` |
| Модель HF | `routes.ts:6489` | `HF_ESTIMATE_MODEL` → `HF_MODEL` → `openai/gpt-oss-20b` |
| **Вызов OpenAI** | `routes.ts:6549` | `POST https://api.openai.com/v1/responses` |
| Модель OpenAI | `routes.ts:6534` | `OPENAI_ESTIMATE_MODEL` → `OPENAI_MODEL` → `gpt-5.2` |

**Параметры вызовов:**
- HF: `temperature: 0.2`, `max_tokens: 1800`, таймаут `25 c` (`routes.ts:6511-6514`).
- OpenAI: `reasoning.effort: "medium"`, `max_output_tokens: 3500`,
  `format: json_object`, таймаут `45 c` (`routes.ts:6564-6568`).

**Конфиг (.env.example):**
- `OPENAI_API_KEY`, `OPENAI_ESTIMATE_MODEL=gpt-5.2`,
  `HF_ESTIMATE_MODEL=openai/gpt-oss-20b` — строки 94-97.
- `HUGGINGFACE_API_KEY` / `HF_TOKEN` — строки 83-84.

---

## Часть 3. Текущие промты (дословно)

### Hugging Face — system (`routes.ts:6502-6505`)
```
You are a senior Russian technical production estimator for events. Understand the brief,
infer what is required to successfully run the event, and return only valid compact JSON.
Estimate realistic daily rental/subcontract prices in RUB using your market knowledge and
the internal price base. Include audio, video, cameras, screens, lighting, networking, power,
signal cables, spare/adapters, labor, transport and reasonable rental/subcontract items.
Do not mention sources or example documents in item reasons.
```

### Hugging Face — user (`routes.ts:6507-6509`)
```
Название: ${title}
ТЗ:
${text.slice(0, 12000)}

Доступный склад:
${warehouseHints}                  // до 80 позиций: "name model (type)"

Внутренняя база примерных рыночных цен, не упоминать клиенту:
${priceHints}                      // до 28 позиций: "name: price RUB"

JSON schema: {"items":[{"name":"string","type":"audio|video|camera|lighting|display|network|power|cable|labor|transport|other","model":"string","quantity":1,"unitPrice":0,"reason":"зачем позиция нужна для мероприятия","confidence":0.7}]}
```

### OpenAI — system (`routes.ts:6560`)
```
Ты старший технический продюсер и инженер смет по мероприятиям. Пойми ТЗ, добавь всё, что
реально нужно для проведения: звук, видео, камеры, экраны, свет, сеть, питание, коммутация,
запас, персонал, логистика. Цены ставь реалистичные для дневной аренды/субподряда в RUB.
Не упоминай внутренние источники цен.
```

### OpenAI — user (`routes.ts:6537-6548`)
```
Название: ${title}
ТЗ:
${text.slice(0, 18000)}

Склад:
${warehouseHints}                  // до 120 позиций

Внутренняя база ориентировочных дневных цен, клиенту источник не писать:
${priceHints}                      // до 36 позиций

Верни только JSON без markdown. Схема:
{"items":[{"name":"string","type":"audio|video|camera|lighting|display|network|power|cable|labor|transport|other","model":"string","quantity":1,"unitPrice":0,"reason":"зачем позиция нужна для мероприятия","confidence":0.7}]}
```

---

## Часть 4. Где DeepSeek и почему «криво работает»

DeepSeek упоминается **только в ops-диагностике platform-admin**, не в сметах:

- Конфиг: `HF_OPS_DEEP_MODEL=deepseek-ai/DeepSeek-V3.2` — `.env.example:87`
  («owner-only AI для эксплуатации платформы»).
- Кнопка «DeepSeek глубоко» — `frontend/src/pages/platform-admin.tsx:1006-1008`.
- Мутация — `platform-admin.tsx:484-490`: `POST /api/platform/ops-ai/analyze`
  с `{ mode: "deep" }`.

### Проблема №1 : backend-маршрут не существует
Backend не содержит обработчика `/api/platform/ops-ai/analyze` — есть только
`/api/platform/users*` (`routes.ts:4997-5037`). Значит кнопки «DeepSeek глубоко» и
«Qwen быстро» всегда падают с **404**. Если жалоба на «криво работает ИИ» про эту
кнопку — причина здесь: фронт написан, backend-ручка не реализована.

---

## Часть 5. Прочие выявленные проблемы

| # | Проблема | Где | Последствие |
|---|---|---|---|
| 1 | Нет backend-маршрута `ops-ai/analyze` | `platform-admin.tsx:486` vs backend | Кнопки Qwen/DeepSeek → 404 |
| 2 | `requireAi` и параметры смен игнорируются | `estimates.tsx:615-628` vs `routes.ts:6593-6596` | Расчёт смен мёртвый, всегда `null` |
| 3 | Модель HF по умолчанию `gpt-oss-20b`, не DeepSeek | `routes.ts:6489` | Несоответствие ожиданию «смета на DeepSeek» |
| 4 | Файл ТЗ читается как `utf8` от raw buffer | `routes.ts:6595` | PDF/DOCX/бинарь → мусор в промте, нет парсинга документов |
| 5 | Ошибка парсинга JSON глушится в `[]` | `routes.ts:6527-6528`, `6585-6586` | Сбой AI незаметен, тихо падает в эвристику |
| 6 | `requireAi` не enforced | `routes.ts:6664-6687` | Без ключа отдаёт эвристику как успех |
| 7 | Цены/склад уходят во внешний AI как есть | промты выше | Внутренняя ценовая база утекает к провайдеру |
