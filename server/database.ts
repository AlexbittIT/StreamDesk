// Поддержка как локального PostgreSQL, так и Neon
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { 
  users, events, equipment, systems, streams, notifications,
  equipmentReservations, telegramUsers, obsConnections, analyticsEvents,
  eventParticipants, tasks, taskComments, taskHistory, roles,
  computers, projects, projectColumns, customLocations, chatSessions, chatMessages, repositories,
  vmixSchedulerEvents, connectionSchemas, connectionSchemaComponents,
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
  type ConnectionSchemaComponent, type InsertConnectionSchemaComponent
} from "@shared/schema";
import { eq, and, gte, lte, sql, or, isNull } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set!");
}

// Создаем клиент PostgreSQL с настройками для стабильного подключения
const client = postgres(connectionString, {
  max: 1, // Один клиент для development
  idle_timeout: 20,
  connect_timeout: 5, // 5 секунд для быстрого подключения
  max_lifetime: 60 * 30, // 30 минут
  prepare: false, // Отключить prepared statements для совместимости
  statement_timeout: 5000, // 5 секунд таймаут для SQL запросов (быстро!)
});

export const db = drizzle(client);

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
}

export class PostgreSQLStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getUserByTelegramId(telegramId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(userData).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.active, true)).orderBy(users.name);
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.update(users).set({ active: false }).where(eq(users.id, id));
    return true;
  }

  // Event Participants
  async getEventParticipants(eventId: string): Promise<EventParticipant[]> {
    return await db.select().from(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  }

  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    const result = await db.insert(eventParticipants).values(participant).returning();
    return result[0];
  }

  async deleteEventParticipant(eventId: string, userId: string): Promise<boolean> {
    await db.delete(eventParticipants)
      .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)));
    return true;
  }

  // Events
  async getEvents(): Promise<Event[]> {
    return await db.select().from(events).orderBy(events.startTime);
  }

  async getEventsByUser(userId: string): Promise<Event[]> {
    return await db.select().from(events).where(eq(events.organizerId, userId)).orderBy(events.startTime);
  }

  async getEventsByDateRange(start: Date, end: Date): Promise<Event[]> {
    return await db.select().from(events)
      .where(and(gte(events.startTime, start), lte(events.startTime, end)))
      .orderBy(events.startTime);
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const result = await db.insert(events).values(insertEvent).returning();
    return result[0];
  }

  async updateEvent(id: string, eventData: Partial<Event>): Promise<Event | undefined> {
    const result = await db.update(events).set(eventData).where(eq(events.id, id)).returning();
    return result[0];
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Equipment
  async getEquipment(): Promise<Equipment[]> {
    return await db.select().from(equipment).orderBy(equipment.name);
  }

  async getEquipmentById(id: string): Promise<Equipment | undefined> {
    const result = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    return result[0];
  }

  async getEquipmentByStatus(status: string): Promise<Equipment[]> {
    return await db.select().from(equipment).where(eq(equipment.status, status)).orderBy(equipment.name);
  }

  async getEquipmentByBarcode(barcode: string): Promise<Equipment | undefined> {
    const result = await db.select().from(equipment).where(eq(equipment.barcode, barcode)).limit(1);
    return result[0];
  }

  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    const result = await db.insert(equipment).values(insertEquipment).returning();
    return result[0];
  }

  async updateEquipment(id: string, equipmentData: Partial<Equipment>): Promise<Equipment | undefined> {
    const result = await db.update(equipment).set(equipmentData).where(eq(equipment.id, id)).returning();
    return result[0];
  }

  async deleteEquipment(id: string): Promise<boolean> {
    const result = await db.delete(equipment).where(eq(equipment.id, id));
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
    return await db.select().from(systems).orderBy(systems.name);
  }

  async getSystemById(id: string): Promise<System | undefined> {
    const result = await db.select().from(systems).where(eq(systems.id, id)).limit(1);
    return result[0];
  }

  async getSystemsByStatus(status: string): Promise<System[]> {
    return await db.select().from(systems).where(eq(systems.status, status)).orderBy(systems.name);
  }

  async createSystem(insertSystem: InsertSystem): Promise<System> {
    const result = await db.insert(systems).values(insertSystem).returning();
    return result[0];
  }

  async updateSystem(id: string, systemData: Partial<System>): Promise<System | undefined> {
    const result = await db.update(systems).set(systemData).where(eq(systems.id, id)).returning();
    return result[0];
  }

  async deleteSystem(id: string): Promise<boolean> {
    const result = await db.delete(systems).where(eq(systems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async pingSystem(id: string, status: string): Promise<System | undefined> {
    return await this.updateSystem(id, { status, lastPing: new Date() });
  }

  // Streams
  async getStreams(): Promise<Stream[]> {
    return await db.select().from(streams).orderBy(streams.createdAt);
  }

  async getActiveStreams(): Promise<Stream[]> {
    return await db.select().from(streams).where(eq(streams.status, "live")).orderBy(streams.startTime);
  }

  async getStreamById(id: string): Promise<Stream | undefined> {
    const result = await db.select().from(streams).where(eq(streams.id, id)).limit(1);
    return result[0];
  }

  async getStreamsByUser(userId: string): Promise<Stream[]> {
    return await db.select().from(streams).where(eq(streams.userId, userId)).orderBy(streams.createdAt);
  }

  async createStream(insertStream: InsertStream): Promise<Stream> {
    const result = await db.insert(streams).values(insertStream).returning();
    return result[0];
  }

  async updateStream(id: string, streamData: Partial<Stream>): Promise<Stream | undefined> {
    const result = await db.update(streams).set(streamData).where(eq(streams.id, id)).returning();
    return result[0];
  }

  // Notifications
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(sql`${notifications.createdAt} DESC`);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const result = await db.insert(notifications).values(insertNotification).returning();
    return result[0];
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const result = await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Equipment Reservations
  async getEquipmentReservations(): Promise<EquipmentReservation[]> {
    return await db.select().from(equipmentReservations).orderBy(equipmentReservations.startTime);
  }

  async getEquipmentReservationsByEquipment(equipmentId: string): Promise<EquipmentReservation[]> {
    return await db.select().from(equipmentReservations)
      .where(eq(equipmentReservations.equipmentId, equipmentId))
      .orderBy(equipmentReservations.startTime);
  }

  async createEquipmentReservation(insertReservation: InsertEquipmentReservation): Promise<EquipmentReservation> {
    const result = await db.insert(equipmentReservations).values(insertReservation).returning();
    return result[0];
  }

  async checkEquipmentConflicts(equipmentId: string, startTime: Date, endTime: Date): Promise<EquipmentReservation[]> {
    return await db.select().from(equipmentReservations)
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
    const result = await db.select().from(telegramUsers).where(eq(telegramUsers.telegramId, telegramId)).limit(1);
    return result[0];
  }

  async createTelegramUser(insertTelegramUser: InsertTelegramUser): Promise<TelegramUser> {
    const result = await db.insert(telegramUsers).values(insertTelegramUser).returning();
    return result[0];
  }

  async updateTelegramUser(telegramId: string, data: Partial<TelegramUser>): Promise<TelegramUser | undefined> {
    const result = await db.update(telegramUsers).set(data).where(eq(telegramUsers.telegramId, telegramId)).returning();
    return result[0];
  }

  async linkTelegramUser(telegramId: string, userId: string): Promise<TelegramUser | undefined> {
    const result = await db.update(telegramUsers).set({ userId }).where(eq(telegramUsers.telegramId, telegramId)).returning();
    return result[0];
  }

  // OBS Connections
  async getObsConnections(): Promise<ObsConnection[]> {
    return await db.select().from(obsConnections).orderBy(obsConnections.name);
  }

  async createObsConnection(insertObsConnection: InsertObsConnection): Promise<ObsConnection> {
    const result = await db.insert(obsConnections).values(insertObsConnection).returning();
    return result[0];
  }

  async updateObsConnection(id: string, obsConnectionData: Partial<ObsConnection>): Promise<ObsConnection | undefined> {
    const result = await db.update(obsConnections).set(obsConnectionData).where(eq(obsConnections.id, id)).returning();
    return result[0];
  }

  async deleteObsConnection(id: string): Promise<boolean> {
    const result = await db.delete(obsConnections).where(eq(obsConnections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Analytics
  async createAnalyticsEvent(insertAnalyticsEvent: InsertAnalyticsEvent): Promise<AnalyticsEvent> {
    const result = await db.insert(analyticsEvents).values(insertAnalyticsEvent).returning();
    return result[0];
  }

  async getAnalyticsEvents(entityType?: string, startDate?: Date, endDate?: Date): Promise<AnalyticsEvent[]> {
    let query = db.select().from(analyticsEvents);
    
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
    return await db.select().from(tasks).orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0];
  }

  async getTasksByAssignee(assigneeId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.assigneeId, assigneeId))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByCreator(creatorId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.creatorId, creatorId))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByAssigneeOrCreator(userId: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(or(eq(tasks.assigneeId, userId), eq(tasks.creatorId, userId)))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async getTasksByStatus(status: string): Promise<Task[]> {
    return await db.select().from(tasks)
      .where(eq(tasks.status, status))
      .orderBy(sql`${tasks.createdAt} DESC`);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const result = await db.insert(tasks).values(insertTask).returning();
    return result[0];
  }

  async updateTask(id: string, taskData: Partial<Task>): Promise<Task | undefined> {
    const dataWithTimestamp = { ...taskData, updatedAt: new Date() };
    const result = await db.update(tasks).set(dataWithTimestamp).where(eq(tasks.id, id)).returning();
    return result[0];
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Task Comments
  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    return await db.select().from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(taskComments.createdAt);
  }

  async createTaskComment(insertComment: InsertTaskComment): Promise<TaskComment> {
    const result = await db.insert(taskComments).values(insertComment).returning();
    return result[0];
  }

  async deleteTaskComment(id: string): Promise<boolean> {
    const result = await db.delete(taskComments).where(eq(taskComments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Task History
  async getTaskHistory(taskId: string): Promise<TaskHistory[]> {
    return await db.select().from(taskHistory)
      .where(eq(taskHistory.taskId, taskId))
      .orderBy(sql`${taskHistory.createdAt} DESC`);
  }

  async createTaskHistory(insertHistory: InsertTaskHistory): Promise<TaskHistory> {
    const result = await db.insert(taskHistory).values(insertHistory).returning();
    return result[0];
  }

  // Roles
  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles).orderBy(roles.name);
  }

  async getRoleById(id: string): Promise<Role | undefined> {
    const result = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return result[0];
  }

  async getRoleByName(name: string): Promise<Role | undefined> {
    const result = await db.select().from(roles).where(eq(roles.name, name)).limit(1);
    return result[0];
  }

  async createRole(insertRole: InsertRole): Promise<Role> {
    const result = await db.insert(roles).values(insertRole).returning();
    return result[0];
  }

  async updateRole(id: string, roleData: Partial<Role>): Promise<Role | undefined> {
    const result = await db.update(roles).set(roleData).where(eq(roles.id, id)).returning();
    return result[0];
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await db.delete(roles).where(eq(roles.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Computers
  async getComputers(): Promise<Computer[]> {
    return await db.select().from(computers).orderBy(computers.name);
  }

  async getComputerById(id: string): Promise<Computer | undefined> {
    const result = await db.select().from(computers).where(eq(computers.id, id)).limit(1);
    return result[0];
  }

  async createComputer(insertComputer: InsertComputer): Promise<Computer> {
    const result = await db.insert(computers).values(insertComputer).returning();
    return result[0];
  }

  async updateComputer(id: string, computerData: Partial<Computer>): Promise<Computer | undefined> {
    const result = await db.update(computers).set(computerData).where(eq(computers.id, id)).returning();
    return result[0];
  }

  async deleteComputer(id: string): Promise<boolean> {
    const result = await db.delete(computers).where(eq(computers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(sql`${projects.createdAt} DESC`);
  }

  async getProjectById(id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const result = await db.insert(projects).values(insertProject).returning();
    return result[0];
  }

  async updateProject(id: string, projectData: Partial<Project>): Promise<Project | undefined> {
    const result = await db.update(projects).set(projectData).where(eq(projects.id, id)).returning();
    return result[0];
  }

  async deleteProject(id: string): Promise<boolean> {
    // Сначала удаляем все столбцы проекта
    await db.delete(projectColumns).where(eq(projectColumns.projectId, id));
    // Затем удаляем сам проект
    const result = await db.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Project Columns
  async getProjectColumns(projectId: string): Promise<ProjectColumn[]> {
    return await db.select().from(projectColumns)
      .where(eq(projectColumns.projectId, projectId))
      .orderBy(sql`${projectColumns.order} ASC`);
  }

  async createProjectColumn(insertColumn: InsertProjectColumn): Promise<ProjectColumn> {
    const result = await db.insert(projectColumns).values(insertColumn).returning();
    return result[0];
  }

  async updateProjectColumn(id: string, columnData: Partial<ProjectColumn>): Promise<ProjectColumn | undefined> {
    const result = await db.update(projectColumns)
      .set(columnData)
      .where(eq(projectColumns.id, id))
      .returning();
    return result[0];
  }

  async deleteProjectColumn(id: string): Promise<boolean> {
    const result = await db.delete(projectColumns).where(eq(projectColumns.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderProjectColumns(projectId: string, columnIds: string[]): Promise<void> {
    // Обновляем порядок всех столбцов за один запрос
    await Promise.all(
      columnIds.map((columnId, index) =>
        db.update(projectColumns)
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
    return await db.select().from(customLocations).orderBy(customLocations.name);
  }

  async createCustomLocation(insertLocation: InsertCustomLocation): Promise<CustomLocation> {
    const result = await db.insert(customLocations).values(insertLocation).returning();
    return result[0];
  }

  async deleteCustomLocation(id: string): Promise<boolean> {
    const result = await db.delete(customLocations).where(eq(customLocations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Repositories
  async getRepositories(): Promise<Repository[]> {
    return await db.select().from(repositories).orderBy(repositories.name);
  }

  async getRepositoryById(id: string): Promise<Repository | undefined> {
    const result = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return result[0];
  }

  async createRepository(insertRepository: InsertRepository): Promise<Repository> {
    const result = await db.insert(repositories).values(insertRepository).returning();
    return result[0];
  }

  async updateRepository(id: string, repositoryData: Partial<Repository>): Promise<Repository | undefined> {
    const result = await db.update(repositories)
      .set({ ...repositoryData, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    return result[0];
  }

  async deleteRepository(id: string): Promise<boolean> {
    const result = await db.delete(repositories).where(eq(repositories.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Chat Sessions
  async getChatSessionsByUser(userId: string): Promise<ChatSession[]> {
    return await db.select().from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(sql`${chatSessions.updatedAt} DESC`);
  }

  async getChatSessionById(id: string): Promise<ChatSession | undefined> {
    const result = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    return result[0];
  }

  async createChatSession(insertSession: InsertChatSession): Promise<ChatSession> {
    const result = await db.insert(chatSessions).values(insertSession).returning();
    return result[0];
  }

  async updateChatSession(id: string, sessionData: Partial<ChatSession>): Promise<ChatSession | undefined> {
    const result = await db.update(chatSessions)
      .set({ ...sessionData, updatedAt: new Date() })
      .where(eq(chatSessions.id, id))
      .returning();
    return result[0];
  }

  async deleteChatSession(id: string): Promise<boolean> {
    // Сначала удаляем все сообщения
    await db.delete(chatMessages).where(eq(chatMessages.sessionId, id));
    // Затем удаляем сессию
    const result = await db.delete(chatSessions).where(eq(chatSessions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Chat Messages
  async getChatMessagesBySession(sessionId: string): Promise<ChatMessage[]> {
    return await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(sql`${chatMessages.createdAt} ASC`);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const result = await db.insert(chatMessages).values(insertMessage).returning();
    // Обновляем время последнего обновления сессии
    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, insertMessage.sessionId));
    return result[0];
  }

  async deleteChatMessage(id: string): Promise<boolean> {
    const result = await db.delete(chatMessages).where(eq(chatMessages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // vMix Scheduler Events
  async getVmixSchedulerEvents(): Promise<VmixSchedulerEvent[]> {
    return await db.select().from(vmixSchedulerEvents)
      .orderBy(sql`${vmixSchedulerEvents.startTime} ASC`);
  }

  async getVmixSchedulerEventById(id: string): Promise<VmixSchedulerEvent | undefined> {
    const result = await db.select().from(vmixSchedulerEvents)
      .where(eq(vmixSchedulerEvents.id, id))
      .limit(1);
    return result[0];
  }

  async createVmixSchedulerEvent(event: InsertVmixSchedulerEvent): Promise<VmixSchedulerEvent> {
    const result = await db.insert(vmixSchedulerEvents).values(event).returning();
    return result[0];
  }

  async updateVmixSchedulerEvent(id: string, eventData: Partial<VmixSchedulerEvent>): Promise<VmixSchedulerEvent | undefined> {
    const result = await db.update(vmixSchedulerEvents)
      .set({ ...eventData, updatedAt: new Date() })
      .where(eq(vmixSchedulerEvents.id, id))
      .returning();
    return result[0];
  }

  async deleteVmixSchedulerEvent(id: string): Promise<boolean> {
    const result = await db.delete(vmixSchedulerEvents).where(eq(vmixSchedulerEvents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Connection Schemas
  async getConnectionSchemas(): Promise<ConnectionSchema[]> {
    return await db.select().from(connectionSchemas)
      .orderBy(sql`${connectionSchemas.createdAt} DESC`);
  }

  async getConnectionSchemaById(id: string): Promise<ConnectionSchema | undefined> {
    const result = await db.select().from(connectionSchemas)
      .where(eq(connectionSchemas.id, id))
      .limit(1);
    return result[0];
  }

  async createConnectionSchema(schema: InsertConnectionSchema): Promise<ConnectionSchema> {
    const result = await db.insert(connectionSchemas).values(schema).returning();
    return result[0];
  }

  async updateConnectionSchema(id: string, schemaData: Partial<ConnectionSchema>): Promise<ConnectionSchema | undefined> {
    const result = await db.update(connectionSchemas)
      .set({ ...schemaData, updatedAt: new Date() })
      .where(eq(connectionSchemas.id, id))
      .returning();
    return result[0];
  }

  async deleteConnectionSchema(id: string): Promise<boolean> {
    // Сначала удаляем все компоненты
    await db.delete(connectionSchemaComponents).where(eq(connectionSchemaComponents.schemaId, id));
    // Затем удаляем схему
    const result = await db.delete(connectionSchemas).where(eq(connectionSchemas.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Connection Schema Components
  async getConnectionSchemaComponents(schemaId: string): Promise<ConnectionSchemaComponent[]> {
    return await db.select().from(connectionSchemaComponents)
      .where(eq(connectionSchemaComponents.schemaId, schemaId))
      .orderBy(sql`${connectionSchemaComponents.createdAt} ASC`);
  }

  async getConnectionSchemaComponentById(id: string): Promise<ConnectionSchemaComponent | undefined> {
    const result = await db.select().from(connectionSchemaComponents)
      .where(eq(connectionSchemaComponents.id, id))
      .limit(1);
    return result[0];
  }

  async createConnectionSchemaComponent(component: InsertConnectionSchemaComponent): Promise<ConnectionSchemaComponent> {
    const result = await db.insert(connectionSchemaComponents).values(component).returning();
    return result[0];
  }

  async updateConnectionSchemaComponent(id: string, componentData: Partial<ConnectionSchemaComponent>): Promise<ConnectionSchemaComponent | undefined> {
    const result = await db.update(connectionSchemaComponents)
      .set({ ...componentData, updatedAt: new Date() })
      .where(eq(connectionSchemaComponents.id, id))
      .returning();
    return result[0];
  }

  async deleteConnectionSchemaComponent(id: string): Promise<boolean> {
    const result = await db.delete(connectionSchemaComponents).where(eq(connectionSchemaComponents.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}

export const storage = new PostgreSQLStorage();
