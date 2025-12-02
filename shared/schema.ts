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
  lastLogin: timestamp("last_login"),
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
  status: text("status").notNull().default("todo"), // todo, in_progress, review, done, cancelled
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  creatorId: varchar("creator_id").references(() => users.id).notNull(),
  assigneeId: varchar("assignee_id").references(() => users.id),
  dueDate: timestamp("due_date"),
  startDate: timestamp("start_date"),
  completedAt: timestamp("completed_at"),
  category: text("category"), // production, equipment, stream, admin, other
  tags: jsonb("tags").default('[]'),
  attachments: jsonb("attachments").default('[]'),
  parentTaskId: varchar("parent_task_id"), // для подзадач
  estimatedHours: integer("estimated_hours"),
  actualHours: integer("actual_hours"),
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
  color: text("color").default("#6B7280"), // цвет для отображения
  isSystem: boolean("is_system").default(false), // системные роли нельзя удалить
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertEquipmentReservationSchema = createInsertSchema(equipmentReservations).omit({
  id: true,
  createdAt: true,
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

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;

export type EventParticipant = typeof eventParticipants.$inferSelect;
export type InsertEventParticipant = z.infer<typeof insertEventParticipantSchema>;

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

export type System = typeof systems.$inferSelect;
export type InsertSystem = z.infer<typeof insertSystemSchema>;

export type Stream = typeof streams.$inferSelect;
export type InsertStream = z.infer<typeof insertStreamSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type EquipmentReservation = typeof equipmentReservations.$inferSelect;
export type InsertEquipmentReservation = z.infer<typeof insertEquipmentReservationSchema>;

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
  
  // Админ
  ADMIN_PANEL: 'admin:panel',
  SETTINGS_MANAGE: 'settings:manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
