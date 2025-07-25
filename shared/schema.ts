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
  position: text("position"), // должность
  department: text("department"), // отдел
  role: text("role").notNull().default("employee"), // admin, employee
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location").notNull(),
  customLocation: text("custom_location"), // возможность вписать свое место
  organizerId: varchar("organizer_id").references(() => users.id).notNull(), // создатель события
  status: text("status").notNull().default("scheduled"), // scheduled, active, completed, cancelled
  type: text("type").notNull().default("stream"), // stream, recording, maintenance, meeting
  createdAt: timestamp("created_at").defaultNow(),
});

// Таблица участников событий
export const eventParticipants = pgTable("event_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("participant"), // organizer, participant, presenter
  status: text("status").default("invited"), // invited, accepted, declined, maybe
  createdAt: timestamp("created_at").defaultNow(),
});

export const equipment = pgTable("equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // microphone, camera, lighting, computer, other
  model: text("model"),
  serialNumber: text("serial_number"),
  inventoryNumber: text("inventory_number"), // инвентарный номер
  specifications: jsonb("specifications"), // характеристики оборудования
  notes: text("notes"), // примечания
  status: text("status").notNull().default("available"), // available, in-use, maintenance, broken
  location: text("location"), // room/event where it's currently used
  assignedTo: varchar("assigned_to").references(() => users.id),
  lastUsed: timestamp("last_used"),
  photos: jsonb("photos").default('[]'), // array of photo URLs
  createdAt: timestamp("created_at").defaultNow(),
});

export const systems = pgTable("systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // computer, server, network
  location: text("location").notNull(),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("offline"), // online, offline, maintenance
  lastPing: timestamp("last_ping"),
  specifications: jsonb("specifications"), // CPU, RAM, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

export const streams = pgTable("streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  platform: text("platform").notNull(), // youtube, vk, twitch
  streamKey: text("stream_key"),
  bitrate: integer("bitrate"),
  fps: integer("fps"),
  resolution: text("resolution"),
  status: text("status").notNull().default("offline"), // offline, live, preparing, ended
  viewerCount: integer("viewer_count").default(0),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  userId: varchar("user_id").references(() => users.id),
  systemId: varchar("system_id").references(() => systems.id),
  metadata: jsonb("metadata"), // platform-specific data
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // info, warning, error, success
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
  status: text("status").notNull().default("active"), // active, completed, cancelled
  createdAt: timestamp("created_at").defaultNow(),
});

export const telegramUsers = pgTable("telegram_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  userId: varchar("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const obsConnections = pgTable("obs_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(4455),
  password: text("password"),
  status: text("status").notNull().default("disconnected"), // connected, disconnected, error
  lastPing: timestamp("last_ping"),
  streamStatus: text("stream_status").default("stopped"), // streaming, recording, stopped
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventType: text("event_type").notNull(), // system_status, stream_start, stream_end, equipment_used
  entityId: varchar("entity_id"), // ID системы, стрима или оборудования
  entityType: text("entity_type").notNull(), // system, stream, equipment
  data: jsonb("data").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
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
