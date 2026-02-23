// Поддержка как локального PostgreSQL, так и Neon
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  users, events, equipment, systems, streams, notifications,
  equipmentReservations, telegramUsers, obsConnections, analyticsEvents,
  eventParticipants, tasks, taskComments, taskHistory, roles,
  computers, projects, projectColumns, customLocations, chatSessions, chatMessages, repositories,
  vmixSchedulerEvents, connectionSchemas, connectionSchemaComponents,
  otisStreamSettings, showParticipantProfiles, showMarkers,
  yougileProjects, yougileBoards, yougileColumns, yougileUsers,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Equipment, type InsertEquipment,
  type System, type InsertSystem,
  type Stream, type InsertStream,
  type Notification, type InsertNotification,
  type EquipmentReservation, type InsertEquipmentReservation,
  type TelegramUser, type InsertTelegramUser,
  type ObsConnection, type InsertObsConnection,
  type AnalyticsEvent, type InsertAnalyticsEvent,
  type EventParticipant, type InsertEventParticipant,
  type Task, type InsertTask,
  type TaskComment, type InsertTaskComment,
  type TaskHistory, type InsertTaskHistory,
  type Role, type InsertRole,
  type Computer, type InsertComputer,
  type Project, type InsertProject,
  type ProjectColumn, type InsertProjectColumn,
  type CustomLocation, type InsertCustomLocation,
  type ChatSession, type InsertChatSession,
  type ChatMessage, type InsertChatMessage,
  type Repository, type InsertRepository,
  type VmixSchedulerEvent, type InsertVmixSchedulerEvent,
  type ConnectionSchema, type InsertConnectionSchema,
  type ConnectionSchemaComponent, type InsertConnectionSchemaComponent,
  type OtisStreamSettings, type InsertOtisStreamSettings,
  type ShowParticipantProfile, type InsertShowParticipantProfile,
  type ShowMarker, type InsertShowMarker,
  type YougileProject, type YougileBoard, type YougileColumn, type YougileUser
} from "@shared/schema";
import { eq, and, gte, lte, sql, or, isNull, inArray } from "drizzle-orm";
import crypto from "crypto";

const connectionString = process.env.DATABASE_URL;

// Клиент и db создаются в initDatabase() при успешном подключении
let client: ReturnType<typeof postgres> | null = null;
export let db: ReturnType<typeof drizzle> | null = null;

// По умолчанию — заглушка; после initDatabase() может быть заменена на PostgreSQLStorage
export let storage: IStorage;
export let isStubStorage = true;

export interface IStorage {
  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByTelegramId(telegramId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  
  // Event Participants
  getEventParticipants(eventId: string): Promise<EventParticipant[]>;
  createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant>;
  updateEventParticipant(id: string, data: { status: string }): Promise<EventParticipant | undefined>;
  deleteEventParticipant(eventId: string, userId: string): Promise<boolean>;
  
  // Events
  getEvents(): Promise<Event[]>;
  getEventsByUser(userId: string): Promise<Event[]>;
  getEventsByDateRange(start: Date, end: Date): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, event: Partial<Event>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;
  
  // Equipment
  getEquipment(): Promise<Equipment[]>;
  getEquipmentById(id: string): Promise<Equipment | undefined>;
  getEquipmentByStatus(status: string): Promise<Equipment[]>;
  getEquipmentByBarcode(barcode: string): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: string, equipment: Partial<Equipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: string): Promise<boolean>;
  uploadEquipmentPhoto(equipmentId: string, photoUrl: string): Promise<Equipment | undefined>;
  
  // Systems
  getSystems(): Promise<System[]>;
  getSystemById(id: string): Promise<System | undefined>;
  getSystemsByStatus(status: string): Promise<System[]>;
  createSystem(system: InsertSystem): Promise<System>;
  updateSystem(id: string, system: Partial<System>): Promise<System | undefined>;
  deleteSystem(id: string): Promise<boolean>;
  pingSystem(id: string, status: string): Promise<System | undefined>;
  
  // Streams
  getStreams(): Promise<Stream[]>;
  getActiveStreams(): Promise<Stream[]>;
  getStreamById(id: string): Promise<Stream | undefined>;
  getStreamsByUser(userId: string): Promise<Stream[]>;
  createStream(stream: InsertStream): Promise<Stream>;
  updateStream(id: string, stream: Partial<Stream>): Promise<Stream | undefined>;
  
  // Notifications
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<boolean>;
  markAllNotificationsRead(userId: string): Promise<number>;
  deleteNotification(id: string): Promise<boolean>;
  
  // Equipment Reservations
  getEquipmentReservations(): Promise<EquipmentReservation[]>;
  getEquipmentReservationsByEquipment(equipmentId: string): Promise<EquipmentReservation[]>;
  createEquipmentReservation(reservation: InsertEquipmentReservation): Promise<EquipmentReservation>;
  checkEquipmentConflicts(equipmentId: string, startTime: Date, endTime: Date): Promise<EquipmentReservation[]>;
  
  // Telegram Users
  getTelegramUserByTelegramId(telegramId: string): Promise<TelegramUser | undefined>;
  createTelegramUser(telegramUser: InsertTelegramUser): Promise<TelegramUser>;
  updateTelegramUser(telegramId: string, data: Partial<TelegramUser>): Promise<TelegramUser | undefined>;
  linkTelegramUser(telegramId: string, userId: string): Promise<TelegramUser | undefined>;
  
  // OBS Connections
  getObsConnections(): Promise<ObsConnection[]>;
  createObsConnection(obsConnection: InsertObsConnection): Promise<ObsConnection>;
  updateObsConnection(id: string, obsConnection: Partial<ObsConnection>): Promise<ObsConnection | undefined>;
  deleteObsConnection(id: string): Promise<boolean>;
  
  // Analytics
  createAnalyticsEvent(analyticsEvent: InsertAnalyticsEvent): Promise<AnalyticsEvent>;
  getAnalyticsEvents(entityType?: string, startDate?: Date, endDate?: Date): Promise<AnalyticsEvent[]>;
  
  // Tasks
  getTasks(): Promise<Task[]>;
  getTaskById(id: string): Promise<Task | undefined>;
  getTaskByYougileTaskId(yougileTaskId: string): Promise<Task | undefined>;
  getTasksByYougileBoardId(yougileBoardId: string): Promise<Task[]>;
  getTasksByAssignee(assigneeId: string): Promise<Task[]>;
  getTasksByCreator(creatorId: string): Promise<Task[]>;
  getTasksByAssigneeOrCreator(userId: string): Promise<Task[]>;
  getTasksByStatus(status: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, task: Partial<Task>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;
  
  // Task Comments
  getTaskComments(taskId: string): Promise<TaskComment[]>;
  createTaskComment(comment: InsertTaskComment): Promise<TaskComment>;
  deleteTaskComment(id: string): Promise<boolean>;
  
  // Task History
  getTaskHistory(taskId: string): Promise<TaskHistory[]>;
  createTaskHistory(history: InsertTaskHistory): Promise<TaskHistory>;
  
  // Roles
  getRoles(): Promise<Role[]>;
  getRoleById(id: string): Promise<Role | undefined>;
  getRoleByName(name: string): Promise<Role | undefined>;
  createRole(role: InsertRole): Promise<Role>;
  updateRole(id: string, role: Partial<Role>): Promise<Role | undefined>;
  deleteRole(id: string): Promise<boolean>;
  
  // Computers
  getComputers(): Promise<Computer[]>;
  getComputerById(id: string): Promise<Computer | undefined>;
  createComputer(computer: InsertComputer): Promise<Computer>;
  updateComputer(id: string, computer: Partial<Computer>): Promise<Computer | undefined>;
  deleteComputer(id: string): Promise<boolean>;
  
  // Projects
  getProjects(): Promise<Project[]>;
  getProjectById(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;
  
  // Project Columns
  getProjectColumns(projectId: string): Promise<ProjectColumn[]>;
  createProjectColumn(column: InsertProjectColumn): Promise<ProjectColumn>;
  updateProjectColumn(id: string, column: Partial<ProjectColumn>): Promise<ProjectColumn | undefined>;
  deleteProjectColumn(id: string): Promise<boolean>;
  reorderProjectColumns(projectId: string, columnIds: string[]): Promise<void>;
  
  // Custom Locations
  getCustomLocations(): Promise<CustomLocation[]>;
  createCustomLocation(location: InsertCustomLocation): Promise<CustomLocation>;
  deleteCustomLocation(id: string): Promise<boolean>;
  
  // Repositories
  getRepositories(): Promise<Repository[]>;
  getRepositoryById(id: string): Promise<Repository | undefined>;
  createRepository(repository: InsertRepository): Promise<Repository>;
  updateRepository(id: string, repository: Partial<Repository>): Promise<Repository | undefined>;
  deleteRepository(id: string): Promise<boolean>;

  // Otis stream settings
  getOtisStreamSettings(): Promise<OtisStreamSettings | undefined>;
  upsertOtisStreamSettings(settings: InsertOtisStreamSettings): Promise<OtisStreamSettings>;

  // Show participant profiles
  getShowParticipantProfiles(eventId: string): Promise<ShowParticipantProfile[]>;
  createShowParticipantProfile(profile: InsertShowParticipantProfile): Promise<ShowParticipantProfile>;
  updateShowParticipantProfile(id: string, data: Partial<ShowParticipantProfile>): Promise<ShowParticipantProfile | undefined>;
  deleteShowParticipantProfile(id: string): Promise<boolean>;

  // Show markers
  getShowMarkers(eventId: string): Promise<ShowMarker[]>;
  createShowMarker(marker: InsertShowMarker): Promise<ShowMarker>;
  updateShowMarker(id: string, data: Partial<ShowMarker>): Promise<ShowMarker | undefined>;
  deleteShowMarker(id: string): Promise<boolean>;

  // YouGile cache (чтение из БД; запись при синхронизации с API)
  getYougileProjects(): Promise<YougileProject[]>;
  upsertYougileProjects(items: { id: string; title?: string | null }[]): Promise<void>;
  getYougileBoards(projectId?: string): Promise<YougileBoard[]>;
  upsertYougileBoards(items: { id: string; projectId: string; title?: string | null }[]): Promise<void>;
  getYougileColumns(boardId: string): Promise<YougileColumn[]>;
  upsertYougileColumns(items: { id: string; boardId: string; title?: string | null; order?: number; color?: number | null }[]): Promise<void>;
  getYougileUsers(): Promise<YougileUser[]>;
  upsertYougileUsers(items: { id: string; email?: string | null; username?: string | null }[]): Promise<void>;
}

export class PostgreSQLStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db!.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db!.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const result = await db!.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = crypto.randomUUID();
    const result = await db!.insert(users).values({ ...insertUser, id }).returning();
    return result[0];
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | undefined> {
    const result = await db!.update(users).set(userData).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getUsers(): Promise<User[]> {
    return await db!.select().from(users).where(eq(users.active, true)).orderBy(users.name);
  }

  async deleteUser(id: string): Promise<boolean> {
    await db!.update(users).set({ active: false }).where(eq(users.id, id));
    return true;
  }

  // Event Participants
  async getEventParticipants(eventId: string): Promise<EventParticipant[]> {
    return await db!.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  }

  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    const id = crypto.randomUUID();
    const result = await db!.insert(eventParticipants).values({ ...participant, id }).returning();
    return result[0];
  }

  async updateEventParticipant(id: string, data: { status: string }): Promise<EventParticipant | undefined> {
    const result = await db!.update(eventParticipants).set(data).where(eq(eventParticipants.id, id)).returning();
    return result[0];
  }

  async deleteEventParticipant(eventId: string, userId: string): Promise<boolean> {
    await db!.delete(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)));
    return true;
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return await db!.select().from(events).orderBy(events.startTime);
  }

  async getEventsByUser(userId: string): Promise<Event[]> {
    return await db!.select().from(events).where(eq(events.organizerId, userId)).orderBy(events.startTime);
  }

  async getEventsByDateRange(start: Date, end: Date): Promise<Event[]> {
    return await db!.select().from(events)
      .where(and(gte(events.startTime, start), lte(events.startTime, end)))
      .orderBy(events.startTime);
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const id = crypto.randomUUID();
    const result = await db!.insert(events).values({ ...insertEvent, id }).returning();
    return result[0];
  }

  async updateEvent(id: string, eventData: Partial<Event>): Promise<Event | undefined> {
    const result = await db!.update(events).set(eventData).where(eq(events.id, id)).returning();
    return result[0];
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db!.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Equipment
  async getEquipment(): Promise<Equipment[]> {
    return await db!.select().from(equipment).orderBy(equipment.name);
  }

  async getEquipmentById(id: string): Promise<Equipment | undefined> {
    const result = await db!.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    return result[0];
  }

  async getEquipmentByStatus(status: string): Promise<Equipment[]> {
    return await db!.select().from(equipment).where(eq(equipment.status, status)).orderBy(equipment.name);
  }

  async getEquipmentByBarcode(barcode: string): Promise<Equipment | undefined> {
    const result = await db!.select().from(equipment).where(eq(equipment.barcode, barcode)).limit(1);
    return result[0];
  }

  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    const id = crypto.randomUUID();
    const result = await db!.insert(equipment).values({ ...insertEquipment, id }).returning();
    return result[0];
  }

  async updateEquipment(id: string, equipmentData: Partial<Equipment>): Promise<Equipment | undefined> {
    const result = await db!.update(equipment).set(equipmentData).where(eq(equipment.id, id)).returning();
    return result[0];
  }

  async deleteEquipment(id: string): Promise<boolean> {
    const result = await db!.delete(equipment).where(eq(equipment.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async uploadEquipmentPhoto(equipmentId: string, photoUrl: string): Promise<Equipment | undefined> {
    const currentEquipment = await this.getEquipmentById(equipmentId);
    if (!currentEquipment) return undefined;
    
    const currentPhotos = (currentEquipment.photos as string[]) || [];
    const newPhotos = [...currentPhotos, photoUrl];
    
    return await this.updateEquipment(equipmentId, { photos: newPhotos });
  }

  // Systems
  async getSystems(): Promise<System[]> {
    return await db!.select().from(systems).orderBy(systems.name);
  }

  async getSystemById(id: string): Promise<System | undefined> {
    const result = await db!.select().from(systems).where(eq(systems.id, id)).limit(1);
    return result[0];
  }

  async getSystemsByStatus(status: string): Promise<System[]> {
    return await db!.select().from(systems).where(eq(systems.status, status)).orderBy(systems.name);
  }

  async createSystem(insertSystem: InsertSystem): Promise<System> {
    const result = await db!.insert(systems).values(insertSystem).returning();
    return result[0];
  }

  async updateSystem(id: string, systemData: Partial<System>): Promise<System | undefined> {
    const result = await db!.update(systems).set(systemData).where(eq(systems.id, id)).returning();
    return result[0];
  }

  async deleteSystem(id: string): Promise<boolean> {
    const result = await db!.delete(systems).where(eq(systems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async pingSystem(id: string, status: string): Promise<System | undefined> {
    return await this.updateSystem(id, { status, lastPing: new Date() });
  }

  // Streams
  async getStreams(): Promise<Stream[]> {
    return await db!.select().from(streams).orderBy(streams.createdAt);
  }

  async getActiveStreams(): Promise<Stream[]> {
    return await db!.select().from(streams).where(eq(streams.status, "live")).orderBy(streams.startTime);
  }

  async getStreamById(id: string): Promise<Stream | undefined> {
    const result = await db!.select().from(streams).where(eq(streams.id, id)).limit(1);
    return result[0];
  }

  async getStreamsByUser(userId: string): Promise<Stream[]> {
    return await db!.select().from(streams).where(eq(streams.userId, userId)).orderBy(streams.createdAt);
  }

  async createStream(insertStream: InsertStream): Promise<Stream> {
    const result = await db!.insert(streams).values(insertStream).returning();
    return result[0];
  }

  async updateStream(id: string, streamData: Partial<Stream>): Promise<Stream | undefined> {
    const result = await db!.update(streams).set(streamData).where(eq(streams.id, id)).returning();
    return result[0];
  }

  // Notifications
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db!.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(sql`${notifications.createdAt} DESC`);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await db!.insert(notifications).values(insertNotification).returning();
    return result[0];
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const result = await db!.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await db!.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
    return result.rowCount ?? 0;
  }

  async deleteNotification(id: string): Promise<boolean> {
    const result = await db!.delete(notifications).where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Equipment Reservations
  async getEquipmentReservations(): Promise<EquipmentReservation[]> {
    return await db!.select().from(equipmentReservations).orderBy(equipmentReservations.startTime);
  }

  async getEquipmentReservationsByEquipment(equipmentId: string): Promise<EquipmentReservation[]> {
    return await db!.select().from(equipmentReservations)
      .where(eq(equipmentReservations.equipmentId, equipmentId))
      .orderBy(equipmentReservations.startTime);
  }

  async createEquipmentReservation(insertReservation: InsertEquipmentReservation): Promise<EquipmentReservation> {
    const result = await db!.insert(equipmentReservations).values(insertReservation).returning();
    return result[0];
  }

  async checkEquipmentConflicts(equipmentId: string, startTime: Date, endTime: Date): Promise<EquipmentReservation[]> {
    return await db!.select().from(equipmentReservations)
      .where(
        and(
          eq(equipmentReservations.equipmentId, equipmentId),
          eq(equipmentReservations.status, "active"),
          sql`${equipmentReservations.startTime} < ${endTime}`,
          sql`${equipmentReservations.endTime} > ${startTime}`
        )
      );
  }

  // Telegram Users
  async getTelegramUserByTelegramId(telegramId: string): Promise<TelegramUser | undefined> {
    const result = await db!.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).limit(1);
    return result[0];
  }

  async createTelegramUser(insertTelegramUser: InsertTelegramUser): Promise<TelegramUser> {
    const result = await db!.insert(telegramUsers).values(insertTelegramUser).returning();
    return result[0];
  }

  async updateTelegramUser(telegramId: string, data: Partial<TelegramUser>): Promise<TelegramUser | undefined> {
    const result = await db!.update(telegramUsers).set(data).where(eq(telegramUsers.telegramId, telegramId)).returning();
    return result[0];
  }

  async linkTelegramUser(telegramId: string, userId: string): Promise<TelegramUser | undefined> {
    const result = await db!.update(telegramUsers).set({ userId }).where(eq(telegramUsers.telegramId, telegramId)).returning();
    return result[0];
  }

  // OBS Connections
  async getObsConnections(): Promise<ObsConnection[]> {
    return await db!.select().from(obsConnections).orderBy(obsConnections.name);
  }

  async createObsConnection(insertObsConnection: InsertObsConnection): Promise<ObsConnection> {
    const result = await db!.insert(obsConnections).values(insertObsConnection).returning();
    return result[0];
  }

  async updateObsConnection(id: string, obsConnectionData: Partial<ObsConnection>): Promise<ObsConnection | undefined> {
    const result = await db!.update(obsConnections).set(obsConnectionData).where(eq(obsConnections.id, id)).returning();
    return result[0];
  }

  async deleteObsConnection(id: string): Promise<boolean> {
    const result = await db!.delete(obsConnections).where(eq(obsConnections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Analytics
  async createAnalyticsEvent(insertAnalyticsEvent: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const result = await db!.insert(analyticsEvents).values(insertAnalyticsEvent).returning();
    return result[0];
  }

  async getAnalyticsEvents(entityType?: string, startDate?: Date, endDate?: Date): Promise<AnalyticsEvent[]> {
    let query = db!.select().from(analyticsEvents);
    
    const conditions = [];
    if (entityType) {
      conditions.push(eq(analyticsEvents.entityType, entityType));
    }
    if (startDate) {
      conditions.push(gte(analyticsEvents.timestamp, startDate));
    }
    if (endDate) {
      conditions.push(lte(analyticsEvents.timestamp, endDate));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return await query.orderBy(sql`${analyticsEvents.timestamp} DESC`);
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    return await db!.select().from(tasks).orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    const result = await db!.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0];
  }

  async getTaskByYougileTaskId(yougileTaskId: string): Promise<Task | undefined> {
    const result = await db!.select().from(tasks).where(eq(tasks.yougileTaskId, yougileTaskId)).limit(1);
    return result[0];
  }

  async getTasksByYougileBoardId(yougileBoardId: string): Promise<Task[]> {
    return await db!.select().from(tasks)
      .where(eq(tasks.yougileBoardId, yougileBoardId))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByAssignee(assigneeId: string): Promise<Task[]> {
    return await db!.select().from(tasks)
      .where(eq(tasks.assigneeId, assigneeId))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByCreator(creatorId: string): Promise<Task[]> {
    return await db!.select().from(tasks)
      .where(eq(tasks.creatorId, creatorId))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByAssigneeOrCreator(userId: string): Promise<Task[]> {
    return await db!.select().from(tasks)
      .where(or(eq(tasks.assigneeId, userId), eq(tasks.creatorId, userId)))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    return await db!.select().from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = crypto.randomUUID();
    const result = await db!.insert(tasks).values({ ...insertTask, id }).returning();
    return result[0];
  }

  async updateTask(id: string, taskData: Partial<Task>): Promise<Task | undefined> {
    const dataWithTimestamp = { ...taskData, updatedAt: new Date() };
    const result = await db!.update(tasks).set(dataWithTimestamp).where(eq(tasks.id, id)).returning();
    return result[0];
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await db!.delete(tasks).where(eq(tasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Task Comments
  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    return await db!.select().from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(taskComments.createdAt);
  }

  async createTaskComment(insertComment: InsertTaskComment): Promise<TaskComment> {
    const result = await db!.insert(taskComments).values(insertComment).returning();
    return result[0];
  }

  async deleteTaskComment(id: string): Promise<boolean> {
    const result = await db!.delete(taskComments).where(eq(taskComments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Task History
  async getTaskHistory(taskId: string): Promise<TaskHistory[]> {
    return await db!.select().from(taskHistory)
      .where(eq(taskHistory.taskId, taskId))
      .orderBy(sql`${taskHistory.createdAt} DESC`);
  }

  async createTaskHistory(insertHistory: InsertTaskHistory): Promise<TaskHistory> {
    const result = await db!.insert(taskHistory).values(insertHistory).returning();
    return result[0];
  }

  // Roles
  async getRoles(): Promise<Role[]> {
    return await db!.select().from(roles).orderBy(roles.name);
  }

  async getRoleById(id: string): Promise<Role | undefined> {
    const result = await db!.select().from(roles).where(eq(roles.id, id)).limit(1);
    return result[0];
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const result = await db!.select().from(roles).where(eq(roles.name, name)).limit(1);
    return result[0];
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const result = await db!.insert(roles).values(insertRole).returning();
    return result[0];
  }

  async updateRole(id: string, roleData: Partial<Role>): Promise<Role | undefined> {
    const result = await db!.update(roles).set(roleData).where(eq(roles.id, id)).returning();
    return result[0];
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await db!.delete(roles).where(eq(roles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Computers
  async getComputers(): Promise<Computer[]> {
    return await db!.select().from(computers).orderBy(computers.name);
  }

  async getComputerById(id: string): Promise<Computer | undefined> {
    const result = await db!.select().from(computers).where(eq(computers.id, id)).limit(1);
    return result[0];
  }

  async createComputer(insertComputer: InsertComputer): Promise<Computer> {
    const result = await db!.insert(computers).values(insertComputer).returning();
    return result[0];
  }

  async updateComputer(id: string, computerData: Partial<Computer>): Promise<Computer | undefined> {
    const result = await db!.update(computers).set(computerData).where(eq(computers.id, id)).returning();
    return result[0];
  }

  async deleteComputer(id: string): Promise<boolean> {
    const result = await db!.delete(computers).where(eq(computers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return await db!.select().from(projects).orderBy(sql`${projects.createdAt} DESC`);
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    const result = await db!.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = crypto.randomUUID();
    const result = await db!.insert(projects).values({ ...insertProject, id }).returning();
    return result[0];
  }

  async updateProject(id: string, projectData: Partial<Project>): Promise<Project | undefined> {
    const result = await db!.update(projects).set(projectData).where(eq(projects.id, id)).returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<boolean> {
    // Сначала удаляем все столбцы проекта
    await db!.delete(projectColumns).where(eq(projectColumns.projectId, id));
    // Затем удаляем сам проект
    const result = await db!.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Project Columns
  async getProjectColumns(projectId: string): Promise<ProjectColumn[]> {
    return await db!.select().from(projectColumns)
      .where(eq(projectColumns.projectId, projectId))
      .orderBy(sql`${projectColumns.order} ASC`);
  }

  async createProjectColumn(insertColumn: InsertProjectColumn): Promise<ProjectColumn> {
    const id = crypto.randomUUID();
    const result = await db!.insert(projectColumns).values({ ...insertColumn, id }).returning();
    return result[0];
  }

  async updateProjectColumn(id: string, columnData: Partial<ProjectColumn>): Promise<ProjectColumn | undefined> {
    const result = await db!.update(projectColumns)
      .set(columnData)
      .where(eq(projectColumns.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectColumn(id: string): Promise<boolean> {
    const result = await db!.delete(projectColumns).where(eq(projectColumns.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderProjectColumns(projectId: string, columnIds: string[]): Promise<void> {
    // Обновляем порядок всех столбцов за один запрос
    await Promise.all(
      columnIds.map((columnId, index) =>
        db!.update(projectColumns)
          .set({ order: index })
          .where(and(
            eq(projectColumns.id, columnId),
            eq(projectColumns.projectId, projectId)
          ))
      )
    );
  }

  // Custom Locations
  async getCustomLocations(): Promise<CustomLocation[]> {
    return await db!.select().from(customLocations).orderBy(customLocations.name);
  }

  async createCustomLocation(insertLocation: InsertCustomLocation): Promise<CustomLocation> {
    const result = await db!.insert(customLocations).values(insertLocation).returning();
    return result[0];
  }

  async deleteCustomLocation(id: string): Promise<boolean> {
    const result = await db!.delete(customLocations).where(eq(customLocations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Repositories
  async getRepositories(): Promise<Repository[]> {
    return await db!.select().from(repositories).orderBy(repositories.name);
  }

  async getRepositoryById(id: string): Promise<Repository | undefined> {
    const result = await db!.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return result[0];
  }

  async createRepository(insertRepository: InsertRepository): Promise<Repository> {
    const result = await db!.insert(repositories).values(insertRepository).returning();
    return result[0];
  }

  async updateRepository(id: string, repositoryData: Partial<Repository>): Promise<Repository | undefined> {
    const result = await db!.update(repositories)
      .set({ ...repositoryData, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    return result[0];
  }

  async deleteRepository(id: string): Promise<boolean> {
    const result = await db!.delete(repositories).where(eq(repositories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Chat Sessions
  async getChatSessionsByUser(userId: string): Promise<ChatSession[]> {
    return await db!.select().from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(sql`${chatSessions.updatedAt} DESC`);
  }

  async getChatSessionById(id: string): Promise<ChatSession | undefined> {
    const result = await db!.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    return result[0];
  }

  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const result = await db!.insert(chatSessions).values(insertSession).returning();
    return result[0];
  }

  async updateChatSession(id: string, sessionData: Partial<ChatSession>): Promise<ChatSession | undefined> {
    const result = await db!.update(chatSessions)
      .set({ ...sessionData, updatedAt: new Date() })
      .where(eq(chatSessions.id, id))
      .returning();
    return result[0];
  }

  async deleteChatSession(id: string): Promise<boolean> {
    // Сначала удаляем все сообщения
    await db!.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    // Затем удаляем сессию
    const result = await db!.delete(chatSessions).where(eq(chatSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Chat Messages
  async getChatMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
    return await db!.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(sql`${chatMessages.createdAt} ASC`);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const result = await db!.insert(chatMessages).values(insertMessage).returning();
    // Обновляем время последнего обновления сессии
    await db!.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, insertMessage.sessionId));
    return result[0];
  }

  async deleteChatMessage(id: string): Promise<boolean> {
    const result = await db!.delete(chatMessages).where(eq(chatMessages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // vMix Scheduler Events
  async getVmixSchedulerEvents(): Promise<VmixSchedulerEvent[]> {
    return await db!.select().from(vmixSchedulerEvents)
      .orderBy(sql`${vmixSchedulerEvents.startTime} ASC`);
  }

  async getVmixSchedulerEventById(id: string): Promise<VmixSchedulerEvent | undefined> {
    const result = await db!.select().from(vmixSchedulerEvents)
      .where(eq(vmixSchedulerEvents.id, id))
      .limit(1);
    return result[0];
  }

  async createVmixSchedulerEvent(event: InsertVmixSchedulerEvent): Promise<VmixSchedulerEvent> {
    const result = await db!.insert(vmixSchedulerEvents).values(event).returning();
    return result[0];
  }

  async updateVmixSchedulerEvent(id: string, eventData: Partial<VmixSchedulerEvent>): Promise<VmixSchedulerEvent | undefined> {
    const result = await db!.update(vmixSchedulerEvents)
      .set({ ...eventData, updatedAt: new Date() })
      .where(eq(vmixSchedulerEvents.id, id))
      .returning();
    return result[0];
  }

  async deleteVmixSchedulerEvent(id: string): Promise<boolean> {
    const result = await db!.delete(vmixSchedulerEvents).where(eq(vmixSchedulerEvents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Connection Schemas
  async getConnectionSchemas(): Promise<ConnectionSchema[]> {
    return await db!.select().from(connectionSchemas)
      .orderBy(sql`${connectionSchemas.createdAt} DESC`);
  }

  async getConnectionSchemaById(id: string): Promise<ConnectionSchema | undefined> {
    const result = await db!.select().from(connectionSchemas)
      .where(eq(connectionSchemas.id, id))
      .limit(1);
    return result[0];
  }

  async createConnectionSchema(schema: InsertConnectionSchema): Promise<ConnectionSchema> {
    const result = await db!.insert(connectionSchemas).values(schema).returning();
    return result[0];
  }

  async updateConnectionSchema(id: string, schemaData: Partial<ConnectionSchema>): Promise<ConnectionSchema | undefined> {
    const result = await db!.update(connectionSchemas)
      .set({ ...schemaData, updatedAt: new Date() })
      .where(eq(connectionSchemas.id, id))
      .returning();
    return result[0];
  }

  async deleteConnectionSchema(id: string): Promise<boolean> {
    // Сначала удаляем все компоненты
    await db!.delete(connectionSchemaComponents).where(eq(connectionSchemaComponents.schemaId, id));
    // Затем удаляем схему
    const result = await db!.delete(connectionSchemas).where(eq(connectionSchemas.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Connection Schema Components
  async getConnectionSchemaComponents(schemaId: string): Promise<ConnectionSchemaComponent[]> {
    return await db!.select().from(connectionSchemaComponents)
      .where(eq(connectionSchemaComponents.schemaId, schemaId))
      .orderBy(sql`${connectionSchemaComponents.createdAt} ASC`);
  }

  async getConnectionSchemaComponentById(id: string): Promise<ConnectionSchemaComponent | undefined> {
    const result = await db!.select().from(connectionSchemaComponents)
      .where(eq(connectionSchemaComponents.id, id))
      .limit(1);
    return result[0];
  }

  async createConnectionSchemaComponent(component: InsertConnectionSchemaComponent): Promise<ConnectionSchemaComponent> {
    const result = await db!.insert(connectionSchemaComponents).values(component).returning();
    return result[0];
  }

  async updateConnectionSchemaComponent(id: string, componentData: Partial<ConnectionSchemaComponent>): Promise<ConnectionSchemaComponent | undefined> {
    const result = await db!.update(connectionSchemaComponents)
      .set({ ...componentData, updatedAt: new Date() })
      .where(eq(connectionSchemaComponents.id, id))
      .returning();
    return result[0];
  }

  async deleteConnectionSchemaComponent(id: string): Promise<boolean> {
    const result = await db!.delete(connectionSchemaComponents).where(eq(connectionSchemaComponents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Otis stream settings
  async getOtisStreamSettings(): Promise<OtisStreamSettings | undefined> {
    const result = await db!.select().from(otisStreamSettings).limit(1);
    return result[0];
  }

  async upsertOtisStreamSettings(settings: InsertOtisStreamSettings): Promise<OtisStreamSettings> {
    const existing = await this.getOtisStreamSettings();
    if (existing) {
      const [updated] = await db!.update(otisStreamSettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(otisStreamSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db!.insert(otisStreamSettings).values(settings).returning();
    return created;
  }

  // Show participant profiles
  async getShowParticipantProfiles(eventId: string): Promise<ShowParticipantProfile[]> {
    return await db!.select().from(showParticipantProfiles)
      .where(eq(showParticipantProfiles.eventId, eventId))
      .orderBy(sql`${showParticipantProfiles.order} ASC NULLS LAST, ${showParticipantProfiles.createdAt} ASC`);
  }

  async createShowParticipantProfile(profile: InsertShowParticipantProfile): Promise<ShowParticipantProfile> {
    const [created] = await db!.insert(showParticipantProfiles).values(profile).returning();
    return created;
  }

  async updateShowParticipantProfile(id: string, data: Partial<ShowParticipantProfile>): Promise<ShowParticipantProfile | undefined> {
    const [updated] = await db!.update(showParticipantProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(showParticipantProfiles.id, id))
      .returning();
    return updated;
  }

  async deleteShowParticipantProfile(id: string): Promise<boolean> {
    const result = await db!.delete(showParticipantProfiles).where(eq(showParticipantProfiles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Show markers
  async getShowMarkers(eventId: string): Promise<ShowMarker[]> {
    return await db!.select().from(showMarkers)
      .where(eq(showMarkers.eventId, eventId))
      .orderBy(sql`${showMarkers.timecode} ASC, ${showMarkers.createdAt} ASC`);
  }

  async createShowMarker(marker: InsertShowMarker): Promise<ShowMarker> {
    const [created] = await db!.insert(showMarkers).values(marker).returning();
    return created;
  }

  async updateShowMarker(id: string, data: Partial<ShowMarker>): Promise<ShowMarker | undefined> {
    const [updated] = await db!.update(showMarkers).set(data).where(eq(showMarkers.id, id)).returning();
    return updated;
  }

  async deleteShowMarker(id: string): Promise<boolean> {
    const result = await db!.delete(showMarkers).where(eq(showMarkers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // YouGile cache
  async getYougileProjects(): Promise<YougileProject[]> {
    if (!db) return [];
    return await db.select().from(yougileProjects).orderBy(yougileProjects.title);
  }

  async upsertYougileProjects(items: { id: string; title?: string | null }[]): Promise<void> {
    if (!db || !items.length) return;
    for (const row of items) {
      await db.insert(yougileProjects).values({ id: row.id, title: row.title ?? null }).onConflictDoUpdate({
        target: yougileProjects.id,
        set: { title: row.title ?? null, syncedAt: new Date() },
      });
    }
  }

  async getYougileBoards(projectId?: string): Promise<YougileBoard[]> {
    if (!db) return [];
    if (projectId) {
      return await db.select().from(yougileBoards).where(eq(yougileBoards.projectId, projectId)).orderBy(yougileBoards.title);
    }
    return await db.select().from(yougileBoards).orderBy(yougileBoards.title);
  }

  async upsertYougileBoards(items: { id: string; projectId: string; title?: string | null }[]): Promise<void> {
    if (!db || !items.length) return;
    for (const row of items) {
      await db.insert(yougileBoards).values({ id: row.id, projectId: row.projectId, title: row.title ?? null }).onConflictDoUpdate({
        target: yougileBoards.id,
        set: { projectId: row.projectId, title: row.title ?? null, syncedAt: new Date() },
      });
    }
  }

  async getYougileColumns(boardId: string): Promise<YougileColumn[]> {
    if (!db) return [];
    return await db.select().from(yougileColumns).where(eq(yougileColumns.boardId, boardId)).orderBy(yougileColumns.order, yougileColumns.id);
  }

  async upsertYougileColumns(items: { id: string; boardId: string; title?: string | null; order?: number; color?: number | null }[]): Promise<void> {
    if (!db || !items.length) return;
    for (const row of items) {
      await db.insert(yougileColumns).values({
        id: row.id,
        boardId: row.boardId,
        title: row.title ?? null,
        order: row.order ?? 0,
        color: row.color ?? null,
      }).onConflictDoUpdate({
        target: yougileColumns.id,
        set: { boardId: row.boardId, title: row.title ?? null, order: row.order ?? 0, color: row.color ?? null, syncedAt: new Date() },
      });
    }
  }

  async getYougileUsers(): Promise<YougileUser[]> {
    if (!db) return [];
    return await db.select().from(yougileUsers);
  }

  async upsertYougileUsers(items: { id: string; email?: string | null; username?: string | null }[]): Promise<void> {
    if (!db || !items.length) return;
    for (const row of items) {
      await db.insert(yougileUsers).values({ id: row.id, email: row.email ?? null, username: row.username ?? null }).onConflictDoUpdate({
        target: yougileUsers.id,
        set: { email: row.email ?? null, username: row.username ?? null, syncedAt: new Date() },
      });
    }
  }
}

// Заглушка хранилища: работает без БД, данные в памяти (теряются при перезапуске)
class StubStorage implements IStorage {
  private users = new Map<string, User>();
  private events = new Map<string, Event>();
  private tasks = new Map<string, Task>();
  private connectionSchemas = new Map<string, ConnectionSchema>();
  private connectionSchemaComponents = new Map<string, ConnectionSchemaComponent>();
  private equipment = new Map<string, Equipment>();
  private projects = new Map<string, Project>();
  private computers = new Map<string, Computer>();
  private systems = new Map<string, System>();
  private otisSettings: OtisStreamSettings | null = null;

  constructor() {
    // Фиксированный id, чтобы после перезапуска сервера клиент (localStorage) всё ещё находил пользователя
    const adminId = "admin-stub-default-id";
    this.users.set(adminId, {
      id: adminId,
      username: "admin",
      password: "admin123",
      name: "Администратор",
      role: "admin",
      active: true,
      createdAt: new Date(),
    } as User);
    // Тестовые карточки оборудования для локального теста (склад)
    const seedEq: Array<Omit<Equipment, "createdAt"> & { createdAt?: Date }> = [
      { id: this.uid(), name: "Sony FX3 Камера", type: "camera", model: "FX3", serialNumber: "SN001", status: "available", location: "Студия А", specifications: { portsIn: [{ id: "1", name: "HDMI", type: "in", portType: "HDMI" }], portsOut: [{ id: "1", name: "HDMI", type: "out", portType: "HDMI" }] }, createdAt: this.now() },
      { id: this.uid(), name: "Микрофон AT2020", type: "microphone", model: "AT2020", serialNumber: "MIC001", status: "available", location: "Подкаст зона", createdAt: this.now() },
      { id: this.uid(), name: "Elgato Key Light", type: "lighting", model: "Key Light Air", status: "available", location: "Студия А", createdAt: this.now() },
      { id: this.uid(), name: "MacBook Pro M2", type: "computer", model: "MacBook Pro 16\"", status: "in-use", location: "Мобильная съёмка", createdAt: this.now() },
      { id: this.uid(), name: "ATEM Mini Pro", type: "other", model: "ATEM Mini Pro", status: "available", location: "Техническая", createdAt: this.now() },
    ];
    seedEq.forEach((e) => this.equipment.set(e.id, e as Equipment));
    // Тестовый проект для локального теста (корзина → проект)
    const defaultProject = { id: this.uid(), name: "Тестовый проект", description: "Для проверки привязки оборудования", status: "planning", createdAt: this.now() } as Project;
    this.projects.set(defaultProject.id, defaultProject);
  }

  private uid() { return crypto.randomUUID(); }
  private now() { return new Date(); }

  async getUsers(): Promise<User[]> { return Array.from(this.users.values()); }
  async getUser(id: string): Promise<User | undefined> { return this.users.get(id); }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.username === username);
  }
  async getUserByTelegramId(): Promise<User | undefined> { return undefined; }
  async createUser(data: InsertUser): Promise<User> {
    const id = this.uid();
    const user = { ...data, id, createdAt: this.now() } as User;
    this.users.set(id, user);
    return user;
  }
  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const u = this.users.get(id);
    if (!u) return undefined;
    const updated = { ...u, ...data };
    this.users.set(id, updated);
    return updated;
  }
  async deleteUser(): Promise<boolean> { return true; }

  async getEventParticipants(): Promise<EventParticipant[]> { return []; }
  async createEventParticipant(data: InsertEventParticipant): Promise<EventParticipant> {
    return { ...data, id: this.uid(), createdAt: this.now() } as EventParticipant;
  }
  async updateEventParticipant(id: string, data: { status: string }): Promise<EventParticipant | undefined> {
    return undefined;
  }
  async deleteEventParticipant(): Promise<boolean> { return true; }

  async getEvents(): Promise<Event[]> { return Array.from(this.events.values()); }
  async getEventsByUser(): Promise<Event[]> { return Array.from(this.events.values()); }
  async getEventsByDateRange(): Promise<Event[]> { return Array.from(this.events.values()); }
  async createEvent(data: InsertEvent): Promise<Event> {
    const id = this.uid();
    const event = { ...data, id, createdAt: this.now() } as Event;
    this.events.set(id, event);
    return event;
  }
  async updateEvent(id: string, data: Partial<Event>): Promise<Event | undefined> {
    const e = this.events.get(id);
    if (!e) return undefined;
    const updated = { ...e, ...data };
    this.events.set(id, updated);
    return updated;
  }
  async deleteEvent(id: string): Promise<boolean> { return this.events.delete(id); }

  async getEquipment(): Promise<Equipment[]> { return Array.from(this.equipment.values()); }
  async getEquipmentById(id: string): Promise<Equipment | undefined> { return this.equipment.get(id); }
  async getEquipmentByStatus(status: string): Promise<Equipment[]> {
    return Array.from(this.equipment.values()).filter((e) => e.status === status);
  }
  async getEquipmentByBarcode(barcode: string): Promise<Equipment | undefined> {
    return Array.from(this.equipment.values()).find((e) => e.barcode === barcode);
  }
  async createEquipment(data: InsertEquipment): Promise<Equipment> {
    const id = this.uid();
    const eq = { ...data, id, createdAt: this.now() } as Equipment;
    this.equipment.set(id, eq);
    return eq;
  }
  async updateEquipment(id: string, data: Partial<Equipment>): Promise<Equipment | undefined> {
    const e = this.equipment.get(id);
    if (!e) return undefined;
    const updated = { ...e, ...data };
    this.equipment.set(id, updated);
    return updated;
  }
  async deleteEquipment(id: string): Promise<boolean> { return this.equipment.delete(id); }
  async uploadEquipmentPhoto(): Promise<Equipment | undefined> { return undefined; }

  async getSystems(): Promise<System[]> { return Array.from(this.systems.values()); }
  async getSystemById(id: string): Promise<System | undefined> { return this.systems.get(id); }
  async getSystemsByStatus(status: string): Promise<System[]> {
    return Array.from(this.systems.values()).filter((s) => s.status === status);
  }
  async createSystem(data: InsertSystem): Promise<System> {
    const id = this.uid();
    const system = { ...data, id, createdAt: this.now() } as System;
    this.systems.set(id, system);
    return system;
  }
  async updateSystem(id: string, data: Partial<System>): Promise<System | undefined> {
    const s = this.systems.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...data };
    this.systems.set(id, updated);
    return updated;
  }
  async deleteSystem(id: string): Promise<boolean> { return this.systems.delete(id); }
  async pingSystem(id: string, status: string): Promise<System | undefined> {
    return this.updateSystem(id, { status });
  }

  async getStreams(): Promise<Stream[]> { return []; }
  async getActiveStreams(): Promise<Stream[]> { return []; }
  async getStreamById(): Promise<Stream | undefined> { return undefined; }
  async getStreamsByUser(): Promise<Stream[]> { return []; }
  async createStream(data: InsertStream): Promise<Stream> {
    return { ...data, id: this.uid(), createdAt: this.now() } as Stream;
  }
  async updateStream(): Promise<Stream | undefined> { return undefined; }

  async getNotificationsByUser(): Promise<Notification[]> { return []; }
  async createNotification(data: InsertNotification): Promise<Notification> {
    return { ...data, id: this.uid(), createdAt: this.now() } as Notification;
  }
  async markNotificationRead(): Promise<boolean> { return true; }
  async markAllNotificationsRead(): Promise<number> { return 0; }
  async deleteNotification(): Promise<boolean> { return true; }

  async getEquipmentReservations(): Promise<EquipmentReservation[]> { return []; }
  async getEquipmentReservationsByEquipment(): Promise<EquipmentReservation[]> { return []; }
  async createEquipmentReservation(data: InsertEquipmentReservation): Promise<EquipmentReservation> {
    return { ...data, id: this.uid(), createdAt: this.now() } as EquipmentReservation;
  }
  async checkEquipmentConflicts(): Promise<EquipmentReservation[]> { return []; }

  async getTelegramUserByTelegramId(): Promise<TelegramUser | undefined> { return undefined; }
  async createTelegramUser(data: InsertTelegramUser): Promise<TelegramUser> {
    return { ...data, id: this.uid(), createdAt: this.now() } as TelegramUser;
  }
  async updateTelegramUser(): Promise<TelegramUser | undefined> { return undefined; }
  async linkTelegramUser(): Promise<TelegramUser | undefined> { return undefined; }

  async getObsConnections(): Promise<ObsConnection[]> { return []; }
  async createObsConnection(data: InsertObsConnection): Promise<ObsConnection> {
    return { ...data, id: this.uid(), createdAt: this.now() } as ObsConnection;
  }
  async updateObsConnection(): Promise<ObsConnection | undefined> { return undefined; }
  async deleteObsConnection(): Promise<boolean> { return true; }

  async createAnalyticsEvent(data: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    return { ...data, id: this.uid(), createdAt: this.now() } as AnalyticsEvent;
  }
  async getAnalyticsEvents(): Promise<AnalyticsEvent[]> { return []; }

  async getTasks(): Promise<Task[]> { return Array.from(this.tasks.values()); }
  async getTaskById(id: string): Promise<Task | undefined> { return this.tasks.get(id); }
  async getTaskByYougileTaskId(yougileTaskId: string): Promise<Task | undefined> {
    return Array.from(this.tasks.values()).find((t) => (t as Task & { yougileTaskId?: string }).yougileTaskId === yougileTaskId);
  }
  async getTasksByYougileBoardId(yougileBoardId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((t) => (t as Task & { yougileBoardId?: string }).yougileBoardId === yougileBoardId);
  }
  async getTasksByAssignee(): Promise<Task[]> { return Array.from(this.tasks.values()); }
  async getTasksByCreator(): Promise<Task[]> { return Array.from(this.tasks.values()); }
  async getTasksByAssigneeOrCreator(): Promise<Task[]> { return Array.from(this.tasks.values()); }
  async getTasksByStatus(): Promise<Task[]> { return Array.from(this.tasks.values()); }
  async createTask(data: InsertTask): Promise<Task> {
    const id = this.uid();
    const task = { ...data, id, createdAt: this.now() } as Task;
    this.tasks.set(id, task);
    return task;
  }
  async updateTask(id: string, data: Partial<Task>): Promise<Task | undefined> {
    const t = this.tasks.get(id);
    if (!t) return undefined;
    const updated = { ...t, ...data };
    this.tasks.set(id, updated);
    return updated;
  }
  async deleteTask(id: string): Promise<boolean> { return this.tasks.delete(id); }

  async getTaskComments(): Promise<TaskComment[]> { return []; }
  async createTaskComment(data: InsertTaskComment): Promise<TaskComment> {
    return { ...data, id: this.uid(), createdAt: this.now() } as TaskComment;
  }
  async deleteTaskComment(): Promise<boolean> { return true; }

  async getTaskHistory(): Promise<TaskHistory[]> { return []; }
  async createTaskHistory(data: InsertTaskHistory): Promise<TaskHistory> {
    return { ...data, id: this.uid(), createdAt: this.now() } as TaskHistory;
  }

  async getRoles(): Promise<Role[]> { return []; }
  async getRoleById(): Promise<Role | undefined> { return undefined; }
  async getRoleByName(): Promise<Role | undefined> { return undefined; }
  async createRole(data: InsertRole): Promise<Role> {
    return { ...data, id: this.uid(), createdAt: this.now() } as Role;
  }
  async updateRole(): Promise<Role | undefined> { return undefined; }
  async deleteRole(): Promise<boolean> { return true; }

  async getComputers(): Promise<Computer[]> { return Array.from(this.computers.values()); }
  async getComputerById(id: string): Promise<Computer | undefined> { return this.computers.get(id); }
  async createComputer(data: InsertComputer): Promise<Computer> {
    const id = this.uid();
    const computer = { ...data, id, createdAt: this.now() } as Computer;
    this.computers.set(id, computer);
    return computer;
  }
  async updateComputer(id: string, data: Partial<Computer>): Promise<Computer | undefined> {
    const c = this.computers.get(id);
    if (!c) return undefined;
    const updated = { ...c, ...data };
    this.computers.set(id, updated);
    return updated;
  }
  async deleteComputer(id: string): Promise<boolean> { return this.computers.delete(id); }

  async getProjects(): Promise<Project[]> { return Array.from(this.projects.values()); }
  async getProjectById(id: string): Promise<Project | undefined> { return this.projects.get(id); }
  async createProject(data: InsertProject): Promise<Project> {
    const id = this.uid();
    const p = { ...data, id, createdAt: this.now() } as Project;
    this.projects.set(id, p);
    return p;
  }
  async updateProject(id: string, data: Partial<Project>): Promise<Project | undefined> {
    const p = this.projects.get(id);
    if (!p) return undefined;
    const updated = { ...p, ...data };
    this.projects.set(id, updated);
    return updated;
  }
  async deleteProject(id: string): Promise<boolean> { return this.projects.delete(id); }

  async getProjectColumns(): Promise<ProjectColumn[]> { return []; }
  async createProjectColumn(data: InsertProjectColumn): Promise<ProjectColumn> {
    return { ...data, id: this.uid(), createdAt: this.now() } as ProjectColumn;
  }
  async updateProjectColumn(): Promise<ProjectColumn | undefined> { return undefined; }
  async deleteProjectColumn(): Promise<boolean> { return true; }
  async reorderProjectColumns(): Promise<void> {}

  async getCustomLocations(): Promise<CustomLocation[]> { return []; }
  async createCustomLocation(data: InsertCustomLocation): Promise<CustomLocation> {
    return { ...data, id: this.uid(), createdAt: this.now() } as CustomLocation;
  }
  async deleteCustomLocation(): Promise<boolean> { return true; }

  async getRepositories(): Promise<Repository[]> { return []; }
  async getRepositoryById(): Promise<Repository | undefined> { return undefined; }
  async createRepository(data: InsertRepository): Promise<Repository> {
    return { ...data, id: this.uid(), createdAt: this.now() } as Repository;
  }
  async updateRepository(): Promise<Repository | undefined> { return undefined; }
  async deleteRepository(): Promise<boolean> { return true; }

  async getOtisStreamSettings(): Promise<OtisStreamSettings | undefined> {
    return this.otisSettings ?? undefined;
  }
  async upsertOtisStreamSettings(data: InsertOtisStreamSettings): Promise<OtisStreamSettings> {
    const id = this.otisSettings?.id ?? this.uid();
    this.otisSettings = { ...data, id, name: data.name ?? "Эфир ОТИС", updatedAt: this.now() } as OtisStreamSettings;
    return this.otisSettings;
  }

  async getShowParticipantProfiles(): Promise<ShowParticipantProfile[]> { return []; }
  async createShowParticipantProfile(data: InsertShowParticipantProfile): Promise<ShowParticipantProfile> {
    return { ...data, id: this.uid(), createdAt: this.now() } as ShowParticipantProfile;
  }
  async updateShowParticipantProfile(): Promise<ShowParticipantProfile | undefined> { return undefined; }
  async deleteShowParticipantProfile(): Promise<boolean> { return true; }

  async getShowMarkers(): Promise<ShowMarker[]> { return []; }
  async createShowMarker(data: InsertShowMarker): Promise<ShowMarker> {
    return { ...data, id: this.uid(), createdAt: this.now() } as ShowMarker;
  }
  async updateShowMarker(): Promise<ShowMarker | undefined> { return undefined; }
  async deleteShowMarker(): Promise<boolean> { return true; }

  private yougileProjectsMap = new Map<string, YougileProject>();
  private yougileBoardsMap = new Map<string, YougileBoard>();
  private yougileColumnsMap = new Map<string, YougileColumn>();
  private yougileUsersMap = new Map<string, YougileUser>();

  async getYougileProjects(): Promise<YougileProject[]> {
    return Array.from(this.yougileProjectsMap.values()).sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }
  async upsertYougileProjects(items: { id: string; title?: string | null }[]): Promise<void> {
    const now = new Date();
    for (const row of items) {
      this.yougileProjectsMap.set(row.id, { id: row.id, title: row.title ?? null, syncedAt: now });
    }
  }
  async getYougileBoards(projectId?: string): Promise<YougileBoard[]> {
    let list = Array.from(this.yougileBoardsMap.values());
    if (projectId) list = list.filter(b => b.projectId === projectId);
    return list.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }
  async upsertYougileBoards(items: { id: string; projectId: string; title?: string | null }[]): Promise<void> {
    const now = new Date();
    for (const row of items) {
      this.yougileBoardsMap.set(row.id, { id: row.id, projectId: row.projectId, title: row.title ?? null, syncedAt: now });
    }
  }
  async getYougileColumns(boardId: string): Promise<YougileColumn[]> {
    return Array.from(this.yougileColumnsMap.values()).filter(c => c.boardId === boardId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  async upsertYougileColumns(items: { id: string; boardId: string; title?: string | null; order?: number; color?: number | null }[]): Promise<void> {
    const now = new Date();
    for (const row of items) {
      this.yougileColumnsMap.set(row.id, { id: row.id, boardId: row.boardId, title: row.title ?? null, order: row.order ?? 0, color: row.color ?? null, syncedAt: now });
    }
  }
  async getYougileUsers(): Promise<YougileUser[]> {
    return Array.from(this.yougileUsersMap.values());
  }
  async upsertYougileUsers(items: { id: string; email?: string | null; username?: string | null }[]): Promise<void> {
    const now = new Date();
    for (const row of items) {
      this.yougileUsersMap.set(row.id, { id: row.id, email: row.email ?? null, username: row.username ?? null, syncedAt: now });
    }
  }

  async getConnectionSchemaComponents(schemaId: string): Promise<ConnectionSchemaComponent[]> {
    return Array.from(this.connectionSchemaComponents.values()).filter(c => c.schemaId === schemaId);
  }
  async getConnectionSchemaComponentById(id: string): Promise<ConnectionSchemaComponent | undefined> {
    return this.connectionSchemaComponents.get(id);
  }
  async createConnectionSchemaComponent(data: InsertConnectionSchemaComponent): Promise<ConnectionSchemaComponent> {
    const id = this.uid();
    const comp = { ...data, id, schemaId: data.schemaId, createdAt: this.now() } as ConnectionSchemaComponent;
    this.connectionSchemaComponents.set(id, comp);
    return comp;
  }
  async updateConnectionSchemaComponent(): Promise<ConnectionSchemaComponent | undefined> { return undefined; }
  async deleteConnectionSchemaComponent(id: string): Promise<boolean> { return this.connectionSchemaComponents.delete(id); }

  async getConnectionSchemas(): Promise<ConnectionSchema[]> { return Array.from(this.connectionSchemas.values()); }
  async getConnectionSchemaById(id: string): Promise<ConnectionSchema | undefined> { return this.connectionSchemas.get(id); }
  async createConnectionSchema(data: InsertConnectionSchema): Promise<ConnectionSchema> {
    const id = this.uid();
    const schema = { ...data, id, name: data.name, description: data.description ?? null, createdAt: this.now(), updatedAt: this.now() } as ConnectionSchema;
    this.connectionSchemas.set(id, schema);
    return schema;
  }
  async updateConnectionSchema(id: string, data: Partial<ConnectionSchema>): Promise<ConnectionSchema | undefined> {
    const s = this.connectionSchemas.get(id);
    if (!s) return undefined;
    const updated = { ...s, ...data, updatedAt: this.now() };
    this.connectionSchemas.set(id, updated);
    return updated;
  }
  async deleteConnectionSchema(id: string): Promise<boolean> {
    for (const [cid, c] of this.connectionSchemaComponents) {
      if (c.schemaId === id) this.connectionSchemaComponents.delete(cid);
    }
    return this.connectionSchemas.delete(id);
  }

  async getChatSessionsByUser(): Promise<ChatSession[]> { return []; }
  async getChatSessionById(): Promise<ChatSession | undefined> { return undefined; }
  async createChatSession(data: InsertChatSession): Promise<ChatSession> {
    return { ...data, id: this.uid(), createdAt: this.now(), updatedAt: this.now() } as ChatSession;
  }
  async updateChatSession(): Promise<ChatSession | undefined> { return undefined; }
  async deleteChatSession(): Promise<boolean> { return true; }
  async getChatMessagesBySession(): Promise<ChatMessage[]> { return []; }
  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    return { ...data, id: this.uid(), createdAt: this.now() } as ChatMessage;
  }
  async deleteChatMessage(): Promise<boolean> { return true; }

  async getVmixSchedulerEvents(): Promise<VmixSchedulerEvent[]> { return []; }
  async getVmixSchedulerEventById(): Promise<VmixSchedulerEvent | undefined> { return undefined; }
  async createVmixSchedulerEvent(data: InsertVmixSchedulerEvent): Promise<VmixSchedulerEvent> {
    return { ...data, id: this.uid(), createdAt: this.now(), updatedAt: this.now() } as VmixSchedulerEvent;
  }
  async updateVmixSchedulerEvent(): Promise<VmixSchedulerEvent | undefined> { return undefined; }
  async deleteVmixSchedulerEvent(): Promise<boolean> { return true; }
}

storage = new StubStorage();

export async function initDatabase(): Promise<void> {
  if (!connectionString || connectionString.trim() === "") {
    console.warn("\n⚠️  DATABASE_URL не задан — работа в режиме заглушки (данные в памяти, не сохраняются между перезапусками).\n");
    return;
  }
  try {
    client = postgres(connectionString, {
      max: 5,
      idle_timeout: 30,
      connect_timeout: 15,
      max_lifetime: 60 * 30,
      prepare: false,
      statement_timeout: 30000,
    });
    db = drizzle(client);
    await client`SELECT 1`;
    storage = new PostgreSQLStorage();
    isStubStorage = false;
    console.log("✅ Подключение к PostgreSQL успешно.");
    try {
      await db!.select().from(users).limit(0);
    } catch (tableErr: any) {
      const tableMsg = (tableErr?.message ?? "").toLowerCase();
      if (/relation.*does not exist|table.*does not exist/.test(tableMsg)) {
        console.warn("\n⚠️  Таблица users не найдена. Выполните миграции: npm run db:push или npx drizzle-kit push\n");
      }
    }
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.warn("\n⚠️  Не удалось подключиться к БД — режим заглушки:", msg);
    console.warn("   Данные будут в памяти (события, задачи, схемы создаются, но не сохраняются после перезапуска).\n");
    storage = new StubStorage();
  }
}
