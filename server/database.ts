import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { 
  users, events, equipment, systems, streams, notifications,
  equipmentReservations, telegramUsers, obsConnections, analyticsEvents,
  eventParticipants, tasks, taskComments, taskHistory, roles,
  computers, projects, customLocations,
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
  type CustomLocation, type InsertCustomLocation
} from "@shared/schema";
import { eq, and, gte, lte, sql, or, isNull } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL!;
const client = neon(connectionString);
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
  
  // Custom Locations
  getCustomLocations(): Promise<CustomLocation[]>;
  createCustomLocation(location: InsertCustomLocation): Promise<CustomLocation>;
  deleteCustomLocation(id: string): Promise<boolean>;
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
    const result = await db.delete(projects).where(eq(projects.id, id));
    return (result.rowCount ?? 0) > 0;
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
}

export const storage = new PostgreSQLStorage();
