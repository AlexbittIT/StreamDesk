import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  position: text("position"),
  department: text("department"),
  role: text("role").notNull().default("employee"), // admin, manager, employee
  permissions: jsonb("permissions").default('[]'), // массив разрешений
  telegramId: text("telegram_id").unique(), // привязка к Telegram
  avatar: text("avatar"), // URL аватара
  active: boolean("active").default(true),
  onboardingCompleted: boolean("onboarding_completed").default(false),
  workspaceMode: text("workspace_mode").default("pending"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const companies = pgTable("companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description"),
  ownerId: varchar("owner_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("active"),
  settings: jsonb("settings").default('{}'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyMembers = pgTable("company_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  invitedBy: varchar("invited_by").references(() => users.id),
  approvedBy: varchar("approved_by").references(() => users.id),
  permissions: jsonb("permissions").default('[]'),
  joinedAt: timestamp("joined_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companyInvites = pgTable("company_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id).notNull(),
  token: text("token").notNull().unique(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  note: text("note"),
  expiresAt: timestamp("expires_at"),
  usedBy: varchar("used_by").references(() => users.id),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location").notNull(),
  customLocation: text("custom_location"),
  organizerId: varchar("organizer_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("scheduled"),
  type: text("type").notNull().default("stream"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const eventParticipants = pgTable("event_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("participant"),
  status: text("status").default("invited"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  model: text("model"),
  serialNumber: text("serial_number"),
  inventoryNumber: text("inventory_number"),
  barcode: text("barcode").unique(), // штрих-код для сканирования
  specifications: jsonb("specifications"),
  notes: text("notes"),
  status: text("status").notNull().default("available"),
  location: text("location"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  lastUsed: timestamp("last_used"),
  photos: jsonb("photos").default('[]'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const systems = pgTable("systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(),
  location: text("location").notNull(),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("offline"),
  lastPing: timestamp("last_ping"),
  specifications: jsonb("specifications"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const streams = pgTable("streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  platform: text("platform").notNull(),
  streamKey: text("stream_key"),
  bitrate: integer("bitrate"),
  fps: integer("fps"),
  resolution: text("resolution"),
  status: text("status").notNull().default("offline"),
  viewerCount: integer("viewer_count").default(0),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  userId: varchar("user_id").references(() => users.id),
  systemId: varchar("system_id").references(() => systems.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  category: text("category").notNull().default("general"),
  value: jsonb("value").default('{}'),
  description: text("description"),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const platformIncidents = pgTable("platform_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id),
  userId: varchar("user_id").references(() => users.id),
  source: text("source").notNull().default("manual"),
  type: text("type").notNull().default("incident"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").default('{}'),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const equipmentReservations = pgTable("equipment_reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  equipmentId: varchar("equipment_id").references(() => equipment.id),
  userId: varchar("user_id").references(() => users.id),
  eventId: varchar("event_id").references(() => events.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const equipmentCheckoutRequests = pgTable("equipment_checkout_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").references(() => companies.id),
  equipmentId: varchar("equipment_id").references(() => equipment.id).notNull(),
  requestedBy: varchar("requested_by").references(() => users.id).notNull(),
  requestType: text("request_type").notNull().default("checkout"),
  currentHolder: varchar("current_holder"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  status: text("status").notNull().default("pending"),
  location: text("location"),
  note: text("note"),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const telegramUsers = pgTable("telegram_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  photoUrl: text("photo_url"),
  authDate: timestamp("auth_date"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const obsConnections = pgTable("obs_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(4455),
  password: text("password"),
  status: text("status").notNull().default("disconnected"),
  lastPing: timestamp("last_ping"),
  streamStatus: text("stream_status").default("stopped"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(),
  entityId: varchar("entity_id"),
  entityType: text("entity_type").notNull(),
  data: jsonb("data").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Таблица задач для таск-менеджера
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("todo"), // todo, in_progress, review, done, cancelled или ID столбца проекта
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  assigneeId: varchar("assignee_id").references(() => users.id),
  companyId: varchar("company_id").references(() => companies.id),
  dueDate: timestamp("due_date"),
  startDate: timestamp("start_date"),
  completedAt: timestamp("completed_at"),
  category: text("category"), // production, equipment, stream, admin, other
  projectId: varchar("project_id").references(() => projects.id), // связь с проектом
  projectColumnId: varchar("project_column_id").references(() => projectColumns.id), // связь со столбцом проекта
  tags: jsonb("tags").default('[]'), // теги/наклейки (в т.ч. из YouGile): [{ id?, name?, color? }]
  subtasks: jsonb("subtasks").default('[]'), // чеклист подзадач: [{ id, title, completed }]
  attachments: jsonb("attachments").default('[]'),
  parentTaskId: varchar("parent_task_id"), // для подзадач (связь с другой задачей)
  estimatedHours: integer("estimated_hours"),
  actualHours: integer("actual_hours"),
  repository: text("repository"), // ссылка на репозиторий (GitHub, GitLab и т.д.)
  links: jsonb("links").default('[]'), // массив ссылок [{ title: string, url: string }]
  yougileTaskId: text("yougile_task_id"), // ID задачи в YouGile для двусторонней синхронизации
  yougileBoardId: text("yougile_board_id"), // ID доски YouGile (для фильтрации задач по доске)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Комментарии к задачам
export const taskComments = pgTable("task_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").default('[]'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// История изменений задач
export const taskHistory = pgTable("task_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // created, updated, status_changed, assigned, commented
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Роли и права доступа
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").notNull().default('[]'),
  color: text("color").default("#6B7280"),
  isSystem: boolean("is_system").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const computers = pgTable("computers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  purpose: text("purpose"),
  status: text("status").notNull().default("active"),
  ipAddress: text("ip_address"),
  components: jsonb("components").default('{}'),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: varchar("owner_id").references(() => users.id),
  companyId: varchar("company_id").references(() => companies.id),
  visibility: text("visibility").notNull().default("company"),
  client: text("client"),
  description: text("description"),
  status: text("status").notNull().default("planning"),
  category: text("category"),
  deadline: timestamp("deadline"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  participants: jsonb("participants").default('[]'), // участники проекта: массив userId
  showInTaskManager: boolean("show_in_task_manager").default(false), // локальная доска в таск-менеджере без обязательного YouGile
  devices: jsonb("devices").default('[]'),
  storageLocation: text("storage_location"),
  estimatedSize: text("estimated_size"),
  notes: text("notes"),
  columns: jsonb("columns").default('[]'), // Кастомные столбцы для Kanban
  yougileBoardId: text("yougile_board_id"), // ID доски YouGile — доска появляется в таск-менеджере
  createdAt: timestamp("created_at").defaultNow(),
});

// Таблица для кастомных столбцов проектов
export const projectColumns = pgTable("project_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id).notNull(),
  name: text("name").notNull(),
  order: integer("order").notNull().default(0),
  color: text("color"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customLocations = pgTable("custom_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  type: text("type").default("storage"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Репозитории для задач
export const repositories = pgTable("repositories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type").default("github"), // github, gitlab, bitbucket, other
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ChatGPT чаты
export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  modelId: text("model_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Сообщения в чатах
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id).notNull(),
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  attachments: jsonb("attachments").default('[]'), // массив файлов
  createdAt: timestamp("created_at").defaultNow(),
});

// vMix Scheduler Events
export const vmixSchedulerEvents = pgTable("vmix_scheduler_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  status: text("status").notNull().default("scheduled"), // scheduled, live, completed, error
  actions: jsonb("actions").default('[]'), // массив действий ["PreviewInput1", "Cut", "StartStreaming"]
  input: text("input"), // номер инпута для переключения
  vmixHost: text("vmix_host"),
  vmixPort: integer("vmix_port"),
  executedAt: timestamp("executed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Connection Schemas (Схемы подключения)
export const connectionSchemas = pgTable("connection_schemas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Connection Schema Components (Компоненты схем подключения: компьютеры, входы, кабели и т.д.)
export const connectionSchemaComponents = pgTable("connection_schema_components", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  schemaId: varchar("schema_id").references(() => connectionSchemas.id).notNull(),
  type: text("type").notNull(), // computer, input, cable, signal, extender, splitter, etc.
  name: text("name").notNull(),
  position: jsonb("position").default('{"x": 0, "y": 0}'), // позиция на схеме
  properties: jsonb("properties").default('{}'), // дополнительные свойства (IP, порты, тип сигнала и т.д.)
  connections: jsonb("connections").default('[]'), // массив связей с другими компонентами
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Эфир ОТИС — настройки потока для вкладки «Эфир ОТИС»
export const otisStreamSettings = pgTable("otis_stream_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default("Эфир ОТИС"),
  streamUrl: text("stream_url"), // HLS/URL после конвертации SRT или прямой поток
  streamUrlBackup: text("stream_url_backup"),
  showTimecode: boolean("show_timecode").default(true),
  withSound: boolean("with_sound").default(true),
  timecodeSource: text("timecode_source").default("local"), // local | vmix — локальный или от vMix (режиссёр)
  vmixHost: text("vmix_host"), // хост vMix для получения таймкода
  vmixPort: integer("vmix_port"), // порт vMix
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Продакшн: личное дело участника шоу (до эфира)
export const showParticipantProfiles = pgTable("show_participant_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(),
  role: text("role"), // ведущий, гость, эксперт и т.д.
  photo: text("photo"),
  bio: text("bio"),
  contacts: jsonb("contacts").default('{}'), // { email, phone, telegram }
  extra: jsonb("extra").default('{}'), // произвольные поля
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Продакшн: маркеры по таймкоду во время эфира (для монтажа)
export const showMarkers = pgTable("show_markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  timecode: text("timecode").notNull(), // "00:12:34" или "00:12:34.500"
  type: text("type").notNull(), // emotion, interest, event, note
  value: text("value"), // например уровень интереса 1-5, тип эмоции
  note: text("note"),
  editorId: varchar("editor_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Кэш YouGile в БД: данные читаются из БД, синхронизация с API — по кнопке или по расписанию
export const yougileProjects = pgTable("yougile_projects", {
  id: varchar("id").primaryKey(), // id из YouGile
  title: text("title"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const yougileBoards = pgTable("yougile_boards", {
  id: varchar("id").primaryKey(),
  projectId: varchar("project_id").notNull(),
  title: text("title"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const yougileColumns = pgTable("yougile_columns", {
  id: varchar("id").primaryKey(),
  boardId: varchar("board_id").notNull(),
  title: text("title"),
  order: integer("order").default(0),
  color: integer("color"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const yougileUsers = pgTable("yougile_users", {
  id: varchar("id").primaryKey(),
  email: text("email"),
  username: text("username"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

// Кэш стикеров доски YouGile (StringStickerState): читаем из БД, без лишних запросов к API
export const yougileStringStickerStates = pgTable("yougile_string_sticker_states", {
  id: varchar("id").primaryKey(),
  boardId: varchar("board_id").notNull(),
  title: text("title"),
  type: text("type"), // "user" | "list" | "string"
  order: integer("order").default(0),
  options: jsonb("options"), // [{ id, title }] для выпадающего списка
  syncedAt: timestamp("synced_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
});

export const insertEventParticipantSchema = createInsertSchema(eventParticipants).omit({
  id: true,
  createdAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanyMemberSchema = createInsertSchema(companyMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanyInviteSchema = createInsertSchema(companyInvites).omit({
  id: true,
  createdAt: true,
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({
  id: true,
  createdAt: true,
});

export const insertSystemSchema = createInsertSchema(systems).omit({
  id: true,
  createdAt: true,
});

export const insertStreamSchema = createInsertSchema(streams).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlatformIncidentSchema = createInsertSchema(platformIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEquipmentReservationSchema = createInsertSchema(equipmentReservations).omit({
  id: true,
  createdAt: true,
});

export const insertEquipmentCheckoutRequestSchema = createInsertSchema(equipmentCheckoutRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
});

export const insertTelegramUserSchema = createInsertSchema(telegramUsers).omit({
  id: true,
  createdAt: true,
});

export const insertObsConnectionSchema = createInsertSchema(obsConnections).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsEventSchema = createInsertSchema(analyticsEvents);

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskHistorySchema = createInsertSchema(taskHistory).omit({
  id: true,
  createdAt: true,
});

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
});

export const insertComputerSchema = createInsertSchema(computers).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertCustomLocationSchema = createInsertSchema(customLocations).omit({
  id: true,
  createdAt: true,
});

export const insertRepositorySchema = createInsertSchema(repositories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export const insertVmixSchedulerEventSchema = createInsertSchema(vmixSchedulerEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConnectionSchemaSchema = createInsertSchema(connectionSchemas).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConnectionSchemaComponentSchema = createInsertSchema(connectionSchemaComponents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOtisStreamSettingsSchema = createInsertSchema(otisStreamSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertShowParticipantProfileSchema = createInsertSchema(showParticipantProfiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertShowMarkerSchema = createInsertSchema(showMarkers).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = z.infer<typeof insertEventParticipantSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type CompanyMember = typeof companyMembers.$inferSelect;
export type InsertCompanyMember = z.infer<typeof insertCompanyMemberSchema>;

export type CompanyInvite = typeof companyInvites.$inferSelect;
export type InsertCompanyInvite = z.infer<typeof insertCompanyInviteSchema>;

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

export type System = typeof systems.$inferSelect;
export type InsertSystem = z.infer<typeof insertSystemSchema>;

export type Stream = typeof streams.$inferSelect;
export type InsertStream = z.infer<typeof insertStreamSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;

export type PlatformIncident = typeof platformIncidents.$inferSelect;
export type InsertPlatformIncident = z.infer<typeof insertPlatformIncidentSchema>;

export type EquipmentReservation = typeof equipmentReservations.$inferSelect;
export type InsertEquipmentReservation = z.infer<typeof insertEquipmentReservationSchema>;

export type EquipmentCheckoutRequest = typeof equipmentCheckoutRequests.$inferSelect;
export type InsertEquipmentCheckoutRequest = z.infer<typeof insertEquipmentCheckoutRequestSchema>;

export type TelegramUser = typeof telegramUsers.$inferSelect;
export type InsertTelegramUser = z.infer<typeof insertTelegramUserSchema>;

export type ObsConnection = typeof obsConnections.$inferSelect;
export type InsertObsConnection = z.infer<typeof insertObsConnectionSchema>;

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = z.infer<typeof insertAnalyticsEventSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;

export type TaskHistory = typeof taskHistory.$inferSelect;
export type InsertTaskHistory = z.infer<typeof insertTaskHistorySchema>;

export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type Computer = typeof computers.$inferSelect;
export type InsertComputer = z.infer<typeof insertComputerSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type ProjectColumn = typeof projectColumns.$inferSelect;
export type InsertProjectColumn = typeof projectColumns.$inferInsert;

export type CustomLocation = typeof customLocations.$inferSelect;
export type InsertCustomLocation = z.infer<typeof insertCustomLocationSchema>;

export type Repository = typeof repositories.$inferSelect;
export type InsertRepository = z.infer<typeof insertRepositorySchema>;

export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

export type VmixSchedulerEvent = typeof vmixSchedulerEvents.$inferSelect;
export type InsertVmixSchedulerEvent = z.infer<typeof insertVmixSchedulerEventSchema>;

export type ConnectionSchema = typeof connectionSchemas.$inferSelect;
export type InsertConnectionSchema = z.infer<typeof insertConnectionSchemaSchema>;

export type ConnectionSchemaComponent = typeof connectionSchemaComponents.$inferSelect;
export type InsertConnectionSchemaComponent = z.infer<typeof insertConnectionSchemaComponentSchema>;

export type OtisStreamSettings = typeof otisStreamSettings.$inferSelect;
export type InsertOtisStreamSettings = z.infer<typeof insertOtisStreamSettingsSchema>;

export type ShowParticipantProfile = typeof showParticipantProfiles.$inferSelect;
export type InsertShowParticipantProfile = z.infer<typeof insertShowParticipantProfileSchema>;

export type ShowMarker = typeof showMarkers.$inferSelect;
export type InsertShowMarker = z.infer<typeof insertShowMarkerSchema>;

export type YougileProject = typeof yougileProjects.$inferSelect;
export type YougileBoard = typeof yougileBoards.$inferSelect;
export type YougileColumn = typeof yougileColumns.$inferSelect;
export type YougileUser = typeof yougileUsers.$inferSelect;
export type YougileStringStickerStateRow = typeof yougileStringStickerStates.$inferSelect;

// Константы для разрешений
export const PERMISSIONS = {
  // Задачи
  TASKS_VIEW: 'tasks:view',
  TASKS_CREATE: 'tasks:create',
  TASKS_EDIT: 'tasks:edit',
  TASKS_DELETE: 'tasks:delete',
  TASKS_ASSIGN: 'tasks:assign',
  
  // Оборудование
  EQUIPMENT_VIEW: 'equipment:view',
  EQUIPMENT_CREATE: 'equipment:create',
  EQUIPMENT_EDIT: 'equipment:edit',
  EQUIPMENT_DELETE: 'equipment:delete',
  EQUIPMENT_RESERVE: 'equipment:reserve',
  
  // События
  EVENTS_VIEW: 'events:view',
  EVENTS_CREATE: 'events:create',
  EVENTS_EDIT: 'events:edit',
  EVENTS_DELETE: 'events:delete',
  
  // Стримы
  STREAMS_VIEW: 'streams:view',
  STREAMS_MANAGE: 'streams:manage',
  
  // Системы
  SYSTEMS_VIEW: 'systems:view',
  SYSTEMS_MANAGE: 'systems:manage',
  
  // Пользователи
  USERS_VIEW: 'users:view',
  USERS_MANAGE: 'users:manage',
  ROLES_MANAGE: 'roles:manage',
  COMPANIES_MANAGE: 'companies:manage',
  INTEGRATIONS_MANAGE: 'integrations:manage',
  PROJECTS_VIEW_ALL: 'projects:view_all',
  
  // Админ
  ADMIN_PANEL: 'admin:panel',
  SETTINGS_MANAGE: 'settings:manage',
  PLATFORM_ADMIN: 'platform:admin',
  MONITORING_PLATFORM: 'monitoring:platform',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Ключи вкладок для разграничения доступа (permission = "tab:" + key)
export const TAB_KEYS = [
  "dashboard",
  "tasks",
  "calendar",
  "maps",
  "room-booking",
  "equipment",
  "estimates",
  "computers",
  "projects",
  "monitoring",
  "streams",
  "servers",
  "connection-schemas",
  "chatgpt",
  "notifications",
  "settings",
  "vmix-scheduler",
  "otis-onair",
  "production",
] as const;

export const TAB_LABELS: Record<string, string> = {
  dashboard: "Панель управления",
  tasks: "Задачи",
  calendar: "Календарь",
  maps: "Карты",
  "room-booking": "Бронирование комнат",
  equipment: "Склад техники",
  estimates: "Смета",
  computers: "Компьютеры",
  projects: "Проекты",
  monitoring: "Мониторинг системы",
  streams: "Стриминг",
  servers: "Серверы",
  "connection-schemas": "Схемы подключения",
  chatgpt: "ChatGPT",
  notifications: "Уведомления",
  settings: "Настройки",
  "vmix-scheduler": "Расписатель vMix",
  "otis-onair": "Эфир ОТИС",
  production: "Продакшн / Шоу",
};

export function tabPermission(key: string): string {
  return `tab:${key}`;
}
