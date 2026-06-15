/**
 * Синхронизация YouGile → БД (проекты, доски, колонки, стикеры, пользователи, задачи).
 * Запросы к API только здесь; клиент читает из БД.
 * При ответе API «слишком много запросов» (429) синхронизация ставится в очередь и повторяется через указанное время.
 */

import { isStubStorage, storage } from "./database";
import {
  isYouGileConfigured,
  clearYougileCache,
  yougileGetProjects,
  yougileGetBoards,
  yougileGetColumns,
  yougileGetUsers,
  yougileGetTasks,
  yougileGetTaskById,
  yougileGetStringStickerStates,
  yougileGetStringStickerValues,
  YouGileRateLimitError,
} from "./yougile";
import { logSuccess, logWarn } from "./vite";

export interface YougileSyncResult {
  created: number;
  updated: number;
  total: number;
  /** true, если из-за лимита запросов синхронизация поставлена в очередь и будет продолжена позже */
  queued?: boolean;
}

/** Очередь повторного запуска синхронизации при срабатывании лимита YouGile */
type SyncJob = { creatorId?: string };
const syncQueue: SyncJob[] = [];
let processQueueTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeYougileIdentity(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

const OPAQUE_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{24,}|[A-Za-z0-9_-]{24,})$/i;

function looksLikeOpaqueId(value: unknown): boolean {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 && OPAQUE_ID_RE.test(normalized);
}

function normalizeYougileDateValue(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "number") {
    const ms = value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return normalizeYougileDateValue(numeric);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  if (typeof value === "object") {
    const nested =
      (value as any).deadline ??
      (value as any).dueDate ??
      (value as any).due_date ??
      (value as any).date ??
      (value as any).expiredAt ??
      (value as any).finishDate ??
      (value as any).endDate ??
      (value as any).value ??
      (value as any).timestamp ??
      (value as any).start ??
      (value as any).seconds ??
      (value as any).unix ??
      (value as any).ms;
    return normalizeYougileDateValue(nested);
  }

  return undefined;
}

function findNestedValueByKey(
  source: unknown,
  matcher: (key: string, value: unknown) => boolean,
  maxDepth = 4,
  seen = new Set<unknown>(),
): unknown {
  if (source == null || typeof source !== "object" || maxDepth < 0 || seen.has(source)) {
    return undefined;
  }
  seen.add(source);

  if (Array.isArray(source)) {
    for (const item of source) {
      const nested = findNestedValueByKey(item, matcher, maxDepth - 1, seen);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  for (const [key, value] of Object.entries(source)) {
    if (matcher(key, value) && value != null && value !== "") {
      return value;
    }
    const nested = findNestedValueByKey(value, matcher, maxDepth - 1, seen);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function collectNestedValuesByKey(
  source: unknown,
  matcher: (key: string, value: unknown) => boolean,
  maxDepth = 4,
  seen = new Set<unknown>(),
  acc: unknown[] = [],
): unknown[] {
  if (source == null || typeof source !== "object" || maxDepth < 0 || seen.has(source)) {
    return acc;
  }
  seen.add(source);

  if (Array.isArray(source)) {
    for (const item of source) {
      collectNestedValuesByKey(item, matcher, maxDepth - 1, seen, acc);
    }
    return acc;
  }

  for (const [key, value] of Object.entries(source)) {
    if (matcher(key, value)) {
      acc.push(value);
    }
    collectNestedValuesByKey(value, matcher, maxDepth - 1, seen, acc);
  }

  return acc;
}

function pickReadableText(candidates: unknown[], options?: { allowOpaqueIds?: boolean }): string | undefined {
  const normalized = candidates
    .map((candidate) => String(candidate ?? "").trim())
    .filter(Boolean);

  if (options?.allowOpaqueIds) {
    return normalized[0];
  }

  return normalized.find((candidate) => !looksLikeOpaqueId(candidate)) ?? normalized[0];
}

function normalizeYougileTimestamp(value: unknown): string | undefined {
  const parsed = normalizeYougileDateValue(value);
  return parsed ? parsed.toISOString() : undefined;
}

function extractYougileActor(rawItem: any): { externalUserId?: string; authorName?: string } {
  const externalUserId = pickReadableText(
    [
      rawItem?.userId,
      rawItem?.authorId,
      rawItem?.creatorId,
      rawItem?.actorId,
      rawItem?.ownerId,
      rawItem?.user?.id,
      rawItem?.author?.id,
      rawItem?.creator?.id,
      rawItem?.actor?.id,
    ],
    { allowOpaqueIds: true },
  );
  const authorName = pickReadableText([
    rawItem?.user?.name,
    rawItem?.author?.name,
    rawItem?.creator?.name,
    rawItem?.actor?.name,
    rawItem?.userName,
    rawItem?.authorName,
    rawItem?.creatorName,
    rawItem?.actorName,
  ]);
  return {
    externalUserId: externalUserId || undefined,
    authorName: authorName || undefined,
  };
}

function extractYougileAssignedIds(task: any): string[] {
  const rawAssigned = task?.assigned ?? task?.assignees ?? task?.responsibles ?? task?.performers;
  const ids = new Set<string>();
  const addCandidate = (candidate: any) => {
    if (candidate == null) return;
    if (typeof candidate === "string") {
      const normalized = candidate.trim();
      if (normalized) ids.add(normalized);
      return;
    }
    if (typeof candidate === "object") {
      const nestedId = candidate.id ?? candidate.userId ?? candidate.assigneeId ?? candidate.value;
      if (nestedId != null && String(nestedId).trim()) ids.add(String(nestedId).trim());
    }
  };

  if (Array.isArray(rawAssigned)) {
    rawAssigned.forEach(addCandidate);
  } else if (rawAssigned && typeof rawAssigned === "object") {
    Object.values(rawAssigned).forEach(addCandidate);
  } else {
    addCandidate(task?.assigneeId);
    addCandidate(task?.assignedTo);
  }

  return Array.from(ids);
}

export function extractYougileDeadline(task: any): Date | undefined {
  const directCandidates = [
    task?.deadline,
    task?.dueDate,
    task?.due_date,
    task?.date,
    task?.expiredAt,
    task?.finishDate,
    task?.endDate,
  ];

  for (const candidate of directCandidates) {
    const parsed = normalizeYougileDateValue(candidate);
    if (parsed) return parsed;
  }

  const nestedCandidate = findNestedValueByKey(
    task,
    (key, value) =>
      /deadline|due(?:_?date)?|expiredat|finishdate|enddate|planned(?:at|date)?/i.test(key) &&
      !/created|updated|modified|synced/i.test(key) &&
      value != null,
    4,
  );

  return normalizeYougileDateValue(nestedCandidate);
}

function looksLikeDeadlineTag(tag: any): boolean {
  const label = String(tag?.name ?? tag?.title ?? tag?.id ?? "").trim().toLowerCase();
  return /deadline|due|date|дедлайн|срок|дата/.test(label);
}

function looksLikeAssigneeTag(tag: any): boolean {
  const label = String(tag?.name ?? tag?.title ?? tag?.id ?? "").trim().toLowerCase();
  return /assignee|performer|responsible|executor|исполнитель|ответственн/.test(label);
}

function extractYougileDeadlineFromTags(tags: any[] | undefined): Date | undefined {
  if (!Array.isArray(tags)) return undefined;
  for (const tag of tags) {
    if (!looksLikeDeadlineTag(tag)) continue;
    const value = tag?.value ?? tag?.displayValue ?? tag?.title ?? tag?.name;
    const parsed = extractYougileDeadline({ deadline: value });
    if (parsed) return parsed;
  }
  return undefined;
}

function extractYougileAssigneeCandidatesFromTags(tags: any[] | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  const values = new Set<string>();
  for (const tag of tags) {
    if (!looksLikeAssigneeTag(tag)) continue;
    const candidate = tag?.value ?? tag?.displayValue ?? tag?.id ?? tag?.name;
    if (candidate != null && String(candidate).trim()) {
      values.add(String(candidate).trim());
    }
  }
  return Array.from(values);
}

type BoardStickerLike = {
  id: string;
  title?: string | null;
  type?: string | null;
  options?: Array<{ id?: string; title?: string | null; color?: string | null }> | null;
};

function normalizeStickerLookupKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function collectStickerRawValues(task: any, sticker: BoardStickerLike): unknown[] {
  const out: unknown[] = [];
  const stickerIdKey = normalizeStickerLookupKey(sticker.id);
  const stickerTitleKey = normalizeStickerLookupKey(sticker.title);
  const directContainers = [
    task?.stickers,
    task?.stringStickers,
    task?.stringStickerValues,
    task?.stringStickerStates,
    task?.customFields,
    task?.fields,
    task?.properties,
    task?.props,
    task?.values,
    task?.meta,
    task?.data,
  ];

  const addValue = (value: unknown) => {
    if (value == null || value === "") return;
    out.push(value);
  };

  for (const container of directContainers) {
    if (!container) continue;

    if (Array.isArray(container)) {
      for (const item of container) {
        if (!item || typeof item !== "object") continue;
        const itemStickerId = normalizeStickerLookupKey(
          (item as any).stickerId ?? (item as any).stringStickerId ?? (item as any).id,
        );
        const itemStickerTitle = normalizeStickerLookupKey((item as any).title ?? (item as any).name);
        if (itemStickerId === stickerIdKey || (stickerTitleKey && itemStickerTitle === stickerTitleKey)) {
          addValue(
            (item as any).value ??
              (item as any).stateId ??
              (item as any).selectedId ??
              (item as any).text ??
              (item as any).title ??
              (item as any).name,
          );
        }
      }
      continue;
    }

    if (typeof container === "object") {
      const record = container as Record<string, unknown>;
      if (sticker.id in record) addValue(record[sticker.id]);
      if (sticker.title && sticker.title in record) addValue(record[sticker.title]);
      for (const [key, value] of Object.entries(record)) {
        const normalizedKey = normalizeStickerLookupKey(key);
        if (normalizedKey === stickerIdKey || (stickerTitleKey && normalizedKey === stickerTitleKey)) {
          addValue(value);
        }
        if (
          value &&
          typeof value === "object" &&
          normalizeStickerLookupKey(
            (value as any).stickerId ?? (value as any).stringStickerId ?? (value as any).id,
          ) === stickerIdKey
        ) {
          addValue(
            (value as any).value ??
              (value as any).stateId ??
              (value as any).selectedId ??
              (value as any).text ??
              (value as any).title ??
              (value as any).name,
          );
        }
      }
    }
  }

  const nested = collectNestedValuesByKey(
    task,
    (key, value) => {
      const normalizedKey = normalizeStickerLookupKey(key);
      if (normalizedKey === stickerIdKey || (stickerTitleKey && normalizedKey === stickerTitleKey)) {
        return true;
      }
      if (value && typeof value === "object") {
        const object = value as any;
        return normalizeStickerLookupKey(object.stickerId ?? object.stringStickerId ?? "") === stickerIdKey;
      }
      return false;
    },
    4,
  );
  for (const value of nested) addValue(value);

  return out;
}

function normalizeStickerEntries(
  rawValue: unknown,
  sticker: BoardStickerLike,
  yougileIdToLabel?: Map<string, string>,
): Array<{ value: string; displayValue?: string; color?: string }> {
  const optionMap = new Map(
    (sticker.options ?? []).map((option) => [
      String(option?.id ?? option?.title ?? "").trim(),
      { title: String(option?.title ?? option?.id ?? "").trim(), color: option?.color ?? undefined },
    ]),
  );

  const normalizeSingle = (value: unknown): Array<{ value: string; displayValue?: string; color?: string }> => {
    if (value == null || value === "") return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => normalizeSingle(item));
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const normalized = String(value).trim();
      if (!normalized) return [];
      const option = optionMap.get(normalized);
      return [{
        value: normalized,
        displayValue: option?.title || yougileIdToLabel?.get(normalized),
        color: option?.color ?? undefined,
      }];
    }

    if (typeof value === "object") {
      const object = value as any;
      return normalizeSingle(
        object.value ??
          object.stateId ??
          object.selectedId ??
          object.userId ??
          object.id ??
          object.name ??
          object.title ??
          object.text,
      ).map((entry) => ({
        ...entry,
        displayValue:
          pickReadableText([object.title, object.name, object.text, object.label], { allowOpaqueIds: true }) ??
          entry.displayValue,
      }));
    }

    return [];
  };

  return normalizeSingle(rawValue);
}

function extractYougileStickerTags(
  task: any,
  stickers: BoardStickerLike[],
  yougileIdToLabel?: Map<string, string>,
): Array<{ id: string; name: string; value?: string; displayValue?: string; color?: string }> {
  const tags: Array<{ id: string; name: string; value?: string; displayValue?: string; color?: string }> = [];

  for (const sticker of stickers) {
    const name = String(sticker.title ?? sticker.id).trim() || sticker.id;
    const rawValues = collectStickerRawValues(task, sticker);
    for (const rawValue of rawValues) {
      for (const entry of normalizeStickerEntries(rawValue, sticker, yougileIdToLabel)) {
        if (!entry.value && !entry.displayValue) continue;
        tags.push({
          id: sticker.id,
          name,
          value: entry.value || undefined,
          displayValue: entry.displayValue || undefined,
          color: entry.color || undefined,
        });
      }
    }
  }

  return tags.filter((tag, index, list) => {
    return (
      list.findIndex(
        (candidate) =>
          candidate.id === tag.id &&
          candidate.value === tag.value &&
          candidate.displayValue === tag.displayValue,
      ) === index
    );
  });
}

function mergeYougileTags(
  baseTags: Array<{ id?: string; name?: string; color?: string; value?: string; displayValue?: string }> | undefined,
  stickerTags: Array<{ id: string; name: string; color?: string; value?: string; displayValue?: string }>,
): Array<{ id?: string; name?: string; color?: string; value?: string; displayValue?: string }> {
  const merged = [...(baseTags ?? []), ...stickerTags];
  return merged.filter((tag, index, list) => {
    const id = String(tag?.id ?? tag?.name ?? "").trim();
    const value = String(tag?.value ?? tag?.displayValue ?? "").trim();
    return list.findIndex((candidate) => {
      const candidateId = String(candidate?.id ?? candidate?.name ?? "").trim();
      const candidateValue = String(candidate?.value ?? candidate?.displayValue ?? "").trim();
      return candidateId === id && candidateValue === value;
    }) === index;
  });
}

export function normalizeYougileSubtasks(
  rawSubtasks: any,
  resolveLinkedTaskTitle?: (taskId: string) => string | undefined,
): Array<{ id: string; title: string; name?: string; description?: string; completed: boolean; linkedTaskId?: string }> | undefined {
  if (rawSubtasks == null) return undefined;

  const normalizeItem = (
    fallbackId: string,
    rawItem: any,
  ): { id: string; title: string; name?: string; description?: string; completed: boolean; linkedTaskId?: string } | null => {
    if (typeof rawItem === "string") {
      const linkedTaskId = rawItem.trim();
      const title = resolveLinkedTaskTitle?.(linkedTaskId) ?? linkedTaskId;
      return title
        ? { id: linkedTaskId || fallbackId, linkedTaskId: linkedTaskId || undefined, title, name: title, completed: false }
        : null;
    }

    if (!rawItem || typeof rawItem !== "object") {
      return null;
    }

    const linkedTaskId = String(
      rawItem.taskId ??
        rawItem.subtaskTaskId ??
        rawItem.childTaskId ??
        rawItem.cardId ??
        rawItem.linkedTaskId ??
        rawItem.id ??
        fallbackId,
    ).trim() || fallbackId;

    const title = pickReadableText([
      rawItem.title,
      rawItem.name,
      rawItem.text,
      rawItem.value,
      rawItem.label,
      rawItem.content,
      rawItem.caption,
      rawItem.task?.title,
      rawItem.task?.name,
      rawItem.task?.text,
      rawItem.task?.description,
      rawItem.item?.title,
      rawItem.item?.name,
      rawItem.card?.title,
      rawItem.card?.name,
      resolveLinkedTaskTitle?.(linkedTaskId),
    ]);
    const description = pickReadableText(
      [
        rawItem.description,
        rawItem.note,
        rawItem.details,
        rawItem.comment,
        rawItem.body,
        rawItem.task?.description,
      ],
      { allowOpaqueIds: true },
    );
    const id = String(rawItem.id ?? rawItem.subtaskId ?? rawItem.checklistId ?? fallbackId).trim() || fallbackId;
    const completed = Boolean(rawItem.completed ?? rawItem.checked ?? rawItem.done ?? rawItem.isCompleted);

    if (!title && !description) return null;
    const resolvedTitle = String(title ?? description ?? "").trim();
    if (!resolvedTitle) return null;

    return {
      id: looksLikeOpaqueId(id) ? linkedTaskId || id : id,
      linkedTaskId: linkedTaskId || undefined,
      title: resolvedTitle,
      name: resolvedTitle,
      description: description || undefined,
      completed,
    };
  };

  if (Array.isArray(rawSubtasks)) {
    return rawSubtasks
      .map((item, index) => normalizeItem(`st-${index + 1}`, item))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  if (typeof rawSubtasks === "object") {
    return Object.entries(rawSubtasks)
      .map(([key, value], index) => {
        if (typeof value === "string") {
          return normalizeItem(key || `st-${index + 1}`, { id: key, title: value, taskId: key });
        }
        if (value && typeof value === "object") {
          return normalizeItem(key || `st-${index + 1}`, { id: key, ...value });
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  return undefined;
}

export function extractYougileTaskComments(task: any): Array<{
  id: string;
  content: string;
  createdAt: string;
  externalUserId?: string;
  authorName?: string;
}> {
  const sources = collectNestedValuesByKey(
    task,
    (key, value) =>
      /comments?|messages?|discussion|chat|thread/i.test(key) &&
      (Array.isArray(value) || (value != null && typeof value === "object")),
    4,
  );
  const out: Array<{
    id: string;
    content: string;
    createdAt: string;
    externalUserId?: string;
    authorName?: string;
  }> = [];
  let index = 0;

  for (const source of sources) {
    const items = Array.isArray(source) ? source : [source];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const content = pickReadableText(
        [
          (rawItem as any).content,
          (rawItem as any).text,
          (rawItem as any).message,
          (rawItem as any).body,
          (rawItem as any).comment,
          (rawItem as any).description,
          (rawItem as any).note,
        ],
        { allowOpaqueIds: true },
      );
      if (!content) continue;
      const createdAt =
        normalizeYougileTimestamp(
          (rawItem as any).createdAt ??
            (rawItem as any).updatedAt ??
            (rawItem as any).date ??
            (rawItem as any).timestamp ??
            (rawItem as any).time ??
            (rawItem as any).sentAt,
        ) ?? new Date().toISOString();
      const actor = extractYougileActor(rawItem);
      const id = String(
        (rawItem as any).id ??
          (rawItem as any).commentId ??
          (rawItem as any).messageId ??
          `yg-comment-${index++}`,
      ).trim();
      out.push({
        id,
        content,
        createdAt,
        externalUserId: actor.externalUserId,
        authorName: actor.authorName,
      });
    }
  }

  return out
    .filter((item, itemIndex, list) => list.findIndex((candidate) => candidate.id === item.id && candidate.content === item.content) === itemIndex)
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function extractYougileTaskHistory(task: any): Array<{
  id: string;
  action: string;
  createdAt: string;
  externalUserId?: string;
  actorName?: string;
  oldValue?: unknown;
  newValue?: unknown;
  summary?: string;
}> {
  const sources = collectNestedValuesByKey(
    task,
    (key, value) =>
      /history|activities|activity|events|logs|changes|audit/i.test(key) &&
      (Array.isArray(value) || (value != null && typeof value === "object")),
    4,
  );
  const out: Array<{
    id: string;
    action: string;
    createdAt: string;
    externalUserId?: string;
    actorName?: string;
    oldValue?: unknown;
    newValue?: unknown;
    summary?: string;
  }> = [];
  let index = 0;

  for (const source of sources) {
    const items = Array.isArray(source) ? source : [source];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const createdAt =
        normalizeYougileTimestamp(
          (rawItem as any).createdAt ??
            (rawItem as any).updatedAt ??
            (rawItem as any).date ??
            (rawItem as any).timestamp ??
            (rawItem as any).time,
        ) ?? new Date().toISOString();
      const action =
        pickReadableText(
          [
            (rawItem as any).action,
            (rawItem as any).type,
            (rawItem as any).kind,
            (rawItem as any).event,
            (rawItem as any).status,
          ],
          { allowOpaqueIds: true },
        ) ?? "updated";
      const summary = pickReadableText(
        [
          (rawItem as any).summary,
          (rawItem as any).message,
          (rawItem as any).text,
          (rawItem as any).description,
          (rawItem as any).note,
          (rawItem as any).comment,
        ],
        { allowOpaqueIds: true },
      );
      const actor = extractYougileActor(rawItem);
      const id = String(
        (rawItem as any).id ??
          (rawItem as any).historyId ??
          (rawItem as any).eventId ??
          `yg-history-${index++}`,
      ).trim();

      if (!summary && !(rawItem as any).oldValue && !(rawItem as any).newValue && !action) {
        continue;
      }

      out.push({
        id,
        action,
        createdAt,
        externalUserId: actor.externalUserId,
        actorName: actor.authorName,
        oldValue: (rawItem as any).oldValue ?? (rawItem as any).before,
        newValue: (rawItem as any).newValue ?? (rawItem as any).after ?? (rawItem as any).payload,
        summary: summary || undefined,
      });
    }
  }

  return out
    .filter((item, itemIndex, list) => list.findIndex((candidate) => candidate.id === item.id && candidate.createdAt === item.createdAt) === itemIndex)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function buildYougileCalendarMarker(yougileTaskId: string): string {
  return `[yougile-task:${yougileTaskId}]`;
}

function buildYougileCalendarTitle(projectTitle: string | undefined, boardTitle: string | undefined, taskTitle: string): string {
  const resolvedTitle = String(taskTitle ?? "").trim();
  if (resolvedTitle) return resolvedTitle;
  const scope = [projectTitle, boardTitle].filter(Boolean).join(" / ");
  return scope || "Карточка YouGile";
}

function buildYougileShadowUsername(rawUser: { id?: string; email?: string | null; username?: string | null; realName?: string | null }): string {
  const base = String(rawUser.username ?? rawUser.email ?? rawUser.id ?? "yougile-user")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const suffix = String(rawUser.id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return `${base || "yougile-user"}${suffix ? `-${suffix}` : ""}`;
}

async function syncYougileTaskCalendarEvent(params: {
  taskId: string;
  title: string;
  description?: string;
  dueDate?: Date;
  creatorId?: string;
  projectTitle?: string;
  boardTitle?: string;
}): Promise<void> {
  const marker = buildYougileCalendarMarker(params.taskId);
  const existingEvents = await storage.getEvents();
  const existingEvent = existingEvents.find((event) => (event.description || "").includes(marker));

  if (!params.dueDate) {
    if (existingEvent) {
      await storage.deleteEvent(existingEvent.id);
    }
    return;
  }

  const startTime = new Date(params.dueDate);
  startTime.setHours(9, 0, 0, 0);
  const endTime = new Date(params.dueDate);
  endTime.setHours(18, 0, 0, 0);

  const title = buildYougileCalendarTitle(params.projectTitle, params.boardTitle, params.title);
  const descriptionParts = [
    params.description?.trim() || `Карточка YouGile: ${params.title}`,
    params.projectTitle ? `Проект: ${params.projectTitle}` : "",
    params.boardTitle ? `Доска: ${params.boardTitle}` : "",
    marker,
  ].filter(Boolean);
  const description = descriptionParts.join("\n");
  const organizerId = params.creatorId ?? (await storage.getUsers())[0]?.id;

  if (existingEvent) {
    await storage.updateEvent(existingEvent.id, {
      title,
      description,
      startTime,
      endTime,
    });
    return;
  }

  await storage.createEvent({
    title,
    description,
    startTime,
    endTime,
    location: "YouGile",
    organizerId,
    type: "meeting",
    status: "scheduled",
  });
}

export async function backfillYougileCalendarEvents(): Promise<number> {
  const [allTasks, boards, projects] = await Promise.all([
    storage.getTasks(),
    storage.getYougileBoards().catch(() => []),
    storage.getYougileProjects().catch(() => []),
  ]);
  const projectTitleById = new Map<string, string>();
  for (const project of projects as any[]) {
    if (project?.id) {
      projectTitleById.set(project.id, String(project.title ?? "").trim() || "Проект");
    }
  }
  const boardInfoById = new Map<string, { title?: string; projectId?: string }>();
  for (const board of boards as any[]) {
    if (!board?.id) continue;
    boardInfoById.set(board.id, {
      title: String(board.title ?? "").trim() || "Доска",
      projectId: board.projectId ?? undefined,
    });
  }

  let synced = 0;
  for (const task of allTasks as any[]) {
    const yougileTaskId = String(task?.yougileTaskId ?? "").trim();
    if (!yougileTaskId) continue;
    const boardId = String(task?.yougileBoardId ?? "").trim();
    const boardInfo = boardInfoById.get(boardId);
    await syncYougileTaskCalendarEvent({
      taskId: yougileTaskId,
      title: String(task?.title ?? "").trim() || "Без названия",
      description: typeof task?.description === "string" ? task.description : undefined,
      dueDate: task?.dueDate ? new Date(task.dueDate) : undefined,
      creatorId: task?.creatorId ?? undefined,
      projectTitle: boardInfo?.projectId ? projectTitleById.get(boardInfo.projectId) : undefined,
      boardTitle: boardInfo?.title,
    });
    synced++;
  }
  return synced;
}

function scheduleProcessQueue(afterMs: number): void {
  if (processQueueTimer) clearTimeout(processQueueTimer);
  processQueueTimer = setTimeout(() => {
    processQueueTimer = null;
    processSyncQueue();
  }, afterMs);
}

async function processSyncQueue(): Promise<void> {
  if (syncQueue.length === 0) return;
  const job = syncQueue[0];
  try {
    const result = await runYougileSyncToDbInternal(job.creatorId);
    syncQueue.shift();
    if (result.queued) return; // уже запланирован следующий запуск внутри
    logSuccess(`YouGile (очередь): синхронизировано — ${result.created} создано, ${result.updated} обновлено, ${result.total} задач`);
    if (syncQueue.length > 0) scheduleProcessQueue(2000);
  } catch (e) {
    if (e instanceof YouGileRateLimitError) {
      logWarn(`YouGile: лимит запросов, повтор через ${Math.round(e.retryAfterMs / 1000)} с`);
      scheduleProcessQueue(e.retryAfterMs);
    } else {
      syncQueue.shift();
      if (syncQueue.length > 0) scheduleProcessQueue(60_000);
    }
  }
}

/** Поставить полную синхронизацию в очередь (вызывается при 429). */
export function enqueueYougileSync(creatorId?: string): void {
  if (!isYouGileConfigured()) return;
  syncQueue.push({ creatorId });
  if (processQueueTimer === null) scheduleProcessQueue(60_000);
}

/** Запустить подтяжку данных YouGile по запросу: ставит одну синхронизацию в очередь и сразу запускает обработку. */
export function triggerYougileSync(creatorId?: string): void {
  if (!isYouGileConfigured()) return;
  if (syncQueue.length === 0) syncQueue.push({ creatorId });
  if (processQueueTimer === null) scheduleProcessQueue(0);
}

/** Очередь досок, для которых не удалось синхронизировать стикеры — повтор через 1 мин */
const retryStickerBoards = new Set<string>();
let retryInterval: ReturnType<typeof setInterval> | null = null;

/** Синхронизировать стикеры одной доски из API в БД. YouGile: список { id, name, states } или по id — GET /string-stickers/:id. */
export async function syncStringStickerStatesForBoard(boardId: string): Promise<void> {
  const list = await yougileGetStringStickerStates(boardId);
  const withOptions = await Promise.all(
    list.map(async (s: any, i: number) => {
      const id = (s.id ?? `sticker-${i}`).toString() || `sticker-${i}`;
      const title = ((s.title ?? s.name ?? s.id ?? id) || "").toString().trim();
      let type = (s.type || "").toString().toLowerCase();
      if (!type && /исполнитель|assignee|performer/i.test(title)) type = "user";
      let options: Array<{ id: string; title?: string }> | undefined = Array.isArray(s.options) ? s.options : undefined;
      if (!options && type !== "user" && id && !id.startsWith("sticker-")) {
        try {
          const values = await yougileGetStringStickerValues(id);
          if (values.length > 0) options = values.map((v: any, j: number) => ({ id: (v.id ?? v.title ?? `opt-${j}`).toString() || `opt-${j}`, title: (v.title ?? v.id ?? "").toString() }));
        } catch {
          /* ignore */
        }
      }
      if (options && options.length > 0 && !type) type = "list";
      if (!type) type = "string";
      return {
        id,
        title: title || id,
        type,
        order: s.order ?? i,
        options: options && options.length > 0 ? options : undefined,
      };
    })
  );
  if (withOptions.length > 0) await storage.upsertYougileStringStickerStates(boardId, withOptions);
}

/** Запустить планировщик повторов: раз в минуту повторять синхронизацию стикеров для досок из очереди. */
export function startYougileRetryScheduler(): void {
  if (retryInterval) return;
  retryInterval = setInterval(async () => {
    if (!isYouGileConfigured() || retryStickerBoards.size === 0) return;
    const boardIds = Array.from(retryStickerBoards);
    for (const boardId of boardIds) {
      try {
        await syncStringStickerStatesForBoard(boardId);
        retryStickerBoards.delete(boardId);
      } catch {
        /* оставим в очереди на следующий раз */
      }
    }
  }, 60_000);
}

/**
 * Внутренняя полная синхронизация (может выбросить YouGileRateLimitError).
 */
async function runYougileSyncToDbInternal(creatorId?: string): Promise<YougileSyncResult> {
  if (!isYouGileConfigured()) {
    throw new Error("YouGile не настроен. Добавьте YOUGILE_API_KEY в .env");
  }
  clearYougileCache();

  const ygProjects = await yougileGetProjects();
  const projectTitleById = new Map<string, string>();
  for (const project of ygProjects) {
    if (project?.id) {
      projectTitleById.set(project.id, (project.title ?? "").toString().trim() || "Проект");
    }
  }
  await storage.upsertYougileProjects(ygProjects.map((p: any) => ({ id: p.id, title: p.title ?? null })));
  const boardInfoById = new Map<string, { title?: string; projectId?: string }>();
  const boardStickersByBoardId = new Map<string, BoardStickerLike[]>();
  for (const p of ygProjects) {
    const boards = await yougileGetBoards(p.id);
    for (const board of boards) {
      boardInfoById.set(board.id, {
        title: (board.title ?? "").toString().trim() || "Доска",
        projectId: board.projectId || p.id,
      });
    }
    await storage.upsertYougileBoards(boards.map((b: any) => ({ id: b.id, projectId: b.projectId || p.id, title: b.title ?? null })));
    for (const b of boards) {
      const cols = await yougileGetColumns(b.id);
      await storage.upsertYougileColumns(cols.map((c: any) => ({ id: c.id, boardId: b.id, title: c.title ?? null, order: c.order ?? 0, color: (c as any).color ?? null })));
      try {
        await syncStringStickerStatesForBoard(b.id);
      } catch {
        retryStickerBoards.add(b.id);
      }
      try {
        boardStickersByBoardId.set(
          b.id,
          (await storage.getYougileStringStickerStates(b.id)) as unknown as BoardStickerLike[],
        );
      } catch {
        boardStickersByBoardId.set(b.id, []);
      }
    }
  }
  const ygUsers = await yougileGetUsers().catch(() => []);
  await storage.upsertYougileUsers(
    ygUsers.map((u: any) => ({
      id: u.id,
      email: u.email ?? null,
      username: u.username ?? u.realName ?? u.email ?? null,
    })),
  );

  const effectiveCreatorId = creatorId ?? (await storage.getUsers()).find((u) => u.role === "admin")?.id;
  let allYgTasks: Array<{ id: string; title?: string; description?: string; columnId?: string; boardId?: string; deadline?: any }> = [];
  for (const p of ygProjects) {
    const boards = await yougileGetBoards(p.id);
    for (const b of boards) {
      const tasks = await yougileGetTasks({ boardId: b.id });
      allYgTasks.push(...tasks);
    }
  }
  const yougileTaskTitleById = new Map<string, string>();
  const yougileTaskDescriptionById = new Map<string, string>();
  for (const task of allYgTasks) {
    const title = String(task?.title ?? "").trim();
    if (task?.id && title) yougileTaskTitleById.set(task.id, title);
    const description = String(task?.description ?? "").trim();
    if (task?.id && description) yougileTaskDescriptionById.set(task.id, description);
  }

  let created = 0;
  let updated = 0;
  const yougileIdToEmail = new Map<string, string>();
  const yougileIdToUsername = new Map<string, string>();
  const yougileIdToLabel = new Map<string, string>();
  for (const u of ygUsers) {
    const email = (u.email || u.username || "").toString().trim().toLowerCase();
    if (email && u.id) yougileIdToEmail.set(u.id, email);
    const username = normalizeYougileIdentity(u.username ?? u.realName ?? u.email);
    if (username && u.id) yougileIdToUsername.set(u.id, username);
    const label = String(u.realName ?? u.username ?? u.email ?? "").trim();
    if (label && u.id) yougileIdToLabel.set(u.id, label);
  }
  const crmUsers = await storage.getUsers();
  const emailToCrmUserId = new Map<string, string>();
  const usernameToCrmUserId = new Map<string, string>();
  const nameToCrmUserId = new Map<string, string>();
  for (const u of crmUsers) {
    const email = (u.email || "").toString().trim().toLowerCase();
    if (email && u.id) emailToCrmUserId.set(email, u.id);
    const username = normalizeYougileIdentity(u.username);
    if (username && u.id) usernameToCrmUserId.set(username, u.id);
    const name = normalizeYougileIdentity(u.name);
    if (name && u.id) nameToCrmUserId.set(name, u.id);
  }
  if (isStubStorage && ygUsers.length > 0) {
    for (const ygUser of ygUsers as any[]) {
      const email = (ygUser.email || "").toString().trim().toLowerCase();
      const username = normalizeYougileIdentity(ygUser.username ?? ygUser.realName ?? ygUser.email);
      const label = String(ygUser.realName ?? ygUser.username ?? ygUser.email ?? "").trim();
      const labelKey = normalizeYougileIdentity(label);
      const existingUserId =
        (email ? emailToCrmUserId.get(email) : undefined) ??
        (username ? usernameToCrmUserId.get(username) ?? nameToCrmUserId.get(username) : undefined) ??
        (labelKey ? nameToCrmUserId.get(labelKey) : undefined);
      if (existingUserId || (!email && !username && !label)) continue;
      try {
        const createdUser = await storage.createUser({
          username: buildYougileShadowUsername(ygUser),
          password: `yougile-shadow-${ygUser.id}`,
          name: label || ygUser.email || ygUser.id,
          email: ygUser.email ?? null,
          role: "employee",
          active: true,
        } as any);
        if (email) emailToCrmUserId.set(email, createdUser.id);
        const createdUsername = normalizeYougileIdentity(createdUser.username);
        const createdName = normalizeYougileIdentity(createdUser.name);
        if (username) usernameToCrmUserId.set(username, createdUser.id);
        if (createdUsername) usernameToCrmUserId.set(createdUsername, createdUser.id);
        if (labelKey) nameToCrmUserId.set(labelKey, createdUser.id);
        if (createdName) nameToCrmUserId.set(createdName, createdUser.id);
      } catch {
        /* ignore shadow-user creation errors in stub mode */
      }
    }
  }

  for (const yt of allYgTasks) {
    const existing = await storage.getTaskByYougileTaskId(yt.id);
    const full = await yougileGetTaskById(yt.id).catch(() => null);
    let ytRes = full ? { ...(yt as any), ...(full as any) } : (yt as any);
    const resolvedTitle = String((full as any)?.title ?? yt.title ?? "").trim();
    if (resolvedTitle) yougileTaskTitleById.set(yt.id, resolvedTitle);
    const resolvedDescription = String((full as any)?.description ?? yt.description ?? "").trim();
    if (resolvedDescription) yougileTaskDescriptionById.set(yt.id, resolvedDescription);
    if (full && Array.isArray((full as any).tags) && (full as any).tags.length > 0) {
      ytRes = { ...ytRes, tags: (full as any).tags };
    } else if (full && Array.isArray((full as any).tagIds) && (full as any).tagIds.length > 0) {
      ytRes = { ...ytRes, tagIds: (full as any).tagIds };
    }
    const boardId = ytRes.boardId ?? yt.boardId ?? "";
    const boardStickerStates = boardStickersByBoardId.get(boardId) ?? [];
    const yougileColumnId = ytRes.columnId ?? yt.columnId;
    const status = yougileColumnId || "todo";
    const ytTags = ytRes.tags ?? ytRes.tagIds;
    const baseTags = Array.isArray(ytTags)
      ? ytTags.map((t: any) =>
          typeof t === "object" && t !== null && ("id" in t || "name" in t)
            ? {
                id: t.id ?? t.name,
                name: t.name ?? t.id,
                color: t.color,
                value: t.value ?? t.stateId ?? undefined,
                displayValue: t.displayValue ?? t.title ?? undefined,
              }
            : { id: String(t), name: String(t) }
        )
      : [];
    const stickerTags = extractYougileStickerTags(ytRes, boardStickerStates, yougileIdToLabel);
    const externalAssignedTags = extractYougileAssignedIds(ytRes)
      .map((assignedId) => {
        const displayValue =
          yougileIdToLabel.get(assignedId) ??
          yougileIdToEmail.get(assignedId) ??
          undefined;
        return {
          id: "yougile-assigned",
          name: "Исполнитель",
          value: assignedId,
          displayValue,
        };
      })
      .filter((tag) => Boolean(tag.value));
    const tags = mergeYougileTags(mergeYougileTags(baseTags, stickerTags), externalAssignedTags);
    const dueDate =
      extractYougileDeadline(ytRes) ??
      extractYougileDeadlineFromTags(tags as any[]);
    const assigned = [...extractYougileAssignedIds(ytRes), ...extractYougileAssigneeCandidatesFromTags(tags as any[])];
    let assigneeId: string | undefined;
    for (const ygId of assigned) {
      const email = yougileIdToEmail.get(ygId);
      if (email) {
        const crmId = emailToCrmUserId.get(email);
        if (crmId) {
          assigneeId = crmId;
          break;
        }
      }
      const ygUsername = yougileIdToUsername.get(ygId);
      if (ygUsername) {
        const crmId = usernameToCrmUserId.get(ygUsername) ?? nameToCrmUserId.get(ygUsername);
        if (crmId) {
          assigneeId = crmId;
          break;
        }
      }
      const directCrmId = usernameToCrmUserId.get(normalizeYougileIdentity(ygId)) ?? nameToCrmUserId.get(normalizeYougileIdentity(ygId));
      if (directCrmId) {
        assigneeId = directCrmId;
        break;
      }
    }
    const ytSubtasks = (ytRes as any).checklist ?? (ytRes as any).subtasks ?? (ytRes as any).checkList;
    let subtasks = normalizeYougileSubtasks(ytSubtasks, (taskId) => yougileTaskTitleById.get(taskId));
    if (Array.isArray(subtasks)) {
      const unresolvedIds = subtasks
        .filter((item) => looksLikeOpaqueId(item.title) || !item.title.trim())
        .map((item) => String(item.linkedTaskId ?? item.id ?? item.title).trim())
        .filter(Boolean);
      for (const unresolvedId of unresolvedIds) {
        if (yougileTaskTitleById.has(unresolvedId)) continue;
        const linkedTask = await yougileGetTaskById(unresolvedId).catch(() => null);
        const linkedTitle = String((linkedTask as any)?.title ?? "").trim();
        const linkedDescription = String((linkedTask as any)?.description ?? "").trim();
        if (linkedTitle) {
          yougileTaskTitleById.set(unresolvedId, linkedTitle);
        }
        if (linkedDescription) {
          yougileTaskDescriptionById.set(unresolvedId, linkedDescription);
        }
      }
      subtasks = subtasks.map((item) => {
        const linkedTaskId = String(item.linkedTaskId ?? item.id ?? item.title).trim();
        const resolvedSubtaskTitle =
          (!item.title.trim() || looksLikeOpaqueId(item.title))
            ? yougileTaskTitleById.get(linkedTaskId)
            : undefined;
        const resolvedSubtaskDescription =
          !String(item.description ?? "").trim()
            ? yougileTaskDescriptionById.get(linkedTaskId)
            : undefined;
        return resolvedSubtaskTitle
          ? {
              ...item,
              title: resolvedSubtaskTitle,
              name: resolvedSubtaskTitle,
              description: resolvedSubtaskDescription ?? item.description,
            }
          : resolvedSubtaskDescription
            ? { ...item, description: resolvedSubtaskDescription }
          : item;
      });
    }

    const payload: any = {
      title: ytRes.title || yt.title || "Без названия",
      description: ytRes.description ?? yt.description ?? undefined,
      status,
      priority: "medium",
      creatorId: effectiveCreatorId ?? undefined,
      assigneeId: assigneeId ?? null,
      dueDate: dueDate ?? null,
      completedAt: ytRes.completedTimestamp ? new Date(Number(ytRes.completedTimestamp)) : null,
      yougileTaskId: yt.id,
      yougileBoardId: boardId || undefined,
    };
    payload.tags = tags ?? [];
    payload.subtasks = subtasks ?? [];
    if (existing) {
      const updatedTask =
        (await storage.updateTask(existing.id, payload)) ??
        ({ ...existing, ...payload } as any);
      const boardInfo = boardInfoById.get(boardId);
      try {
        await syncYougileTaskCalendarEvent({
          taskId: yt.id,
          title: updatedTask.title,
          description: updatedTask.description ?? undefined,
          dueDate: dueDate ?? undefined,
          creatorId: updatedTask.creatorId ?? effectiveCreatorId ?? undefined,
          projectTitle: boardInfo?.projectId ? projectTitleById.get(boardInfo.projectId) : undefined,
          boardTitle: boardInfo?.title,
        });
      } catch (calendarError) {
        logWarn(`[YouGile] Calendar sync failed for task ${yt.id}: ${String((calendarError as any)?.message ?? calendarError)}`);
      }
      updated++;
    } else {
      if (!payload.creatorId) {
        const firstUser = (await storage.getUsers())[0]?.id;
        if (firstUser) payload.creatorId = firstUser;
      }
      const createdTask = await storage.createTask(payload as any);
      const boardInfo = boardInfoById.get(boardId);
      try {
        await syncYougileTaskCalendarEvent({
          taskId: yt.id,
          title: createdTask.title,
          description: createdTask.description ?? undefined,
          dueDate: dueDate ?? undefined,
          creatorId: createdTask.creatorId ?? effectiveCreatorId ?? undefined,
          projectTitle: boardInfo?.projectId ? projectTitleById.get(boardInfo.projectId) : undefined,
          boardTitle: boardInfo?.title,
        });
      } catch (calendarError) {
        logWarn(`[YouGile] Calendar sync failed for task ${yt.id}: ${String((calendarError as any)?.message ?? calendarError)}`);
      }
      created++;
    }
  }
  return { created, updated, total: allYgTasks.length };
}

/**
 * Полная синхронизация из YouGile в БД.
 * При ответе API «слишком много запросов» (429) ставит синхронизацию в очередь и возвращает queued: true;
 * очередь обрабатывается в фоне, со временем все данные подтянутся в БД. Клиент при запросах получает данные из БД.
 */
export async function runYougileSyncToDb(creatorId?: string): Promise<YougileSyncResult> {
  try {
    return await runYougileSyncToDbInternal(creatorId);
  } catch (e) {
    if (e instanceof YouGileRateLimitError) {
      enqueueYougileSync(creatorId);
      scheduleProcessQueue(e.retryAfterMs);
      return { created: 0, updated: 0, total: 0, queued: true };
    }
    throw e;
  }
}
