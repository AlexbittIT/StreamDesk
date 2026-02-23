import { 
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Equipment, type InsertEquipment,
  type System, type InsertSystem,
  type Stream, type InsertStream,
  type Notification, type InsertNotification
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User | undefined>;
  
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
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: string, equipment: Partial<Equipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: string): Promise<boolean>;
  
  // Systems
  getSystems(): Promise<System[]>;
  getSystemById(id: string): Promise<System | undefined>;
  getSystemsByStatus(status: string): Promise<System[]>;
  createSystem(system: InsertSystem): Promise<System>;
  updateSystem(id: string, system: Partial<System>): Promise<System | undefined>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private events: Map<string, Event> = new Map();
  private equipment: Map<string, Equipment> = new Map();
  private systems: Map<string, System> = new Map();
  private streams: Map<string, Stream> = new Map();
  private notifications: Map<string, Notification> = new Map();

  constructor() {
    this.initializeData();
  }

  private initializeData() {
    // Create default admin user
    const adminUser: User = {
      id: randomUUID(),
      username: "admin",
      password: "admin123",
      name: "Администратор",
      role: "admin",
      createdAt: new Date(),
    };
    this.users.set(adminUser.id, adminUser);

    // Create default employee
    const employee: User = {
      id: randomUUID(),
      username: "ivan",
      password: "ivan123",
      name: "Иван Петров",
      role: "employee",
      createdAt: new Date(),
    };
    this.users.set(employee.id, employee);

    // Initialize some systems
    const systems: System[] = [
      {
        id: randomUUID(),
        name: "Студия А - ПК1",
        type: "computer",
        location: "Студия А",
        ipAddress: "192.168.1.10",
        status: "online",
        lastPing: new Date(),
        specifications: { cpu: "Intel i7", ram: "32GB", gpu: "RTX 3080" },
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "Студия А - ПК2", 
        type: "computer",
        location: "Студия А",
        ipAddress: "192.168.1.11",
        status: "online",
        lastPing: new Date(),
        specifications: { cpu: "Intel i7", ram: "16GB", gpu: "RTX 3070" },
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "Студия Б - ПК1",
        type: "computer", 
        location: "Студия Б",
        ipAddress: "192.168.1.20",
        status: "offline",
        lastPing: new Date(Date.now() - 300000),
        specifications: { cpu: "Intel i5", ram: "16GB", gpu: "GTX 1660" },
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "Сервер стримов",
        type: "server",
        location: "Серверная",
        ipAddress: "192.168.1.100",
        status: "online",
        lastPing: new Date(),
        specifications: { cpu: "Xeon E5", ram: "64GB", storage: "2TB SSD" },
        createdAt: new Date(),
      },
    ];

    systems.forEach(system => this.systems.set(system.id, system));

    // Initialize equipment
    const equipmentItems: Equipment[] = [
      {
        id: randomUUID(),
        name: "Shure SM7B",
        type: "microphone",
        model: "SM7B",
        serialNumber: "SM7B001",
        status: "in-use",
        location: "Студия А",
        assignedTo: employee.id,
        lastUsed: new Date(),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "Sony A7S III",
        type: "camera",
        model: "A7S III",
        serialNumber: "A7S001",
        status: "in-use",
        location: "Студия Б",
        assignedTo: employee.id,
        lastUsed: new Date(),
        createdAt: new Date(),
      },
      {
        id: randomUUID(),
        name: "Godox SL-60W",
        type: "lighting",
        model: "SL-60W",
        serialNumber: "SL60001",
        status: "in-use",
        location: "Студия А",
        assignedTo: employee.id,
        lastUsed: new Date(),
        createdAt: new Date(),
      },
    ];

    equipmentItems.forEach(item => this.equipment.set(item.id, item));
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Event methods
  async getEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  async getEventsByUser(userId: string): Promise<Event[]> {
    return Array.from(this.events.values()).filter(event => event.userId === userId);
  }

  async getEventsByDateRange(start: Date, end: Date): Promise<Event[]> {
    return Array.from(this.events.values()).filter(event => 
      event.startTime >= start && event.startTime <= end
    );
  }

  async createEvent(insertEvent: InsertEvent): Promise<Event> {
    const event: Event = {
      ...insertEvent,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.events.set(event.id, event);
    return event;
  }

  async updateEvent(id: string, eventData: Partial<Event>): Promise<Event | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;
    
    const updatedEvent = { ...event, ...eventData };
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }

  async deleteEvent(id: string): Promise<boolean> {
    return this.events.delete(id);
  }

  // Equipment methods
  async getEquipment(): Promise<Equipment[]> {
    return Array.from(this.equipment.values());
  }

  async getEquipmentById(id: string): Promise<Equipment | undefined> {
    return this.equipment.get(id);
  }

  async getEquipmentByStatus(status: string): Promise<Equipment[]> {
    return Array.from(this.equipment.values()).filter(item => item.status === status);
  }

  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    const equipment: Equipment = {
      ...insertEquipment,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.equipment.set(equipment.id, equipment);
    return equipment;
  }

  async updateEquipment(id: string, equipmentData: Partial<Equipment>): Promise<Equipment | undefined> {
    const equipment = this.equipment.get(id);
    if (!equipment) return undefined;
    
    const updatedEquipment = { ...equipment, ...equipmentData };
    this.equipment.set(id, updatedEquipment);
    return updatedEquipment;
  }

  async deleteEquipment(id: string): Promise<boolean> {
    return this.equipment.delete(id);
  }

  // System methods
  async getSystems(): Promise<System[]> {
    return Array.from(this.systems.values());
  }

  async getSystemById(id: string): Promise<System | undefined> {
    return this.systems.get(id);
  }

  async getSystemsByStatus(status: string): Promise<System[]> {
    return Array.from(this.systems.values()).filter(system => system.status === status);
  }

  async createSystem(insertSystem: InsertSystem): Promise<System> {
    const system: System = {
      ...insertSystem,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.systems.set(system.id, system);
    return system;
  }

  async updateSystem(id: string, systemData: Partial<System>): Promise<System | undefined> {
    const system = this.systems.get(id);
    if (!system) return undefined;
    
    const updatedSystem = { ...system, ...systemData };
    this.systems.set(id, updatedSystem);
    return updatedSystem;
  }

  // Stream methods
  async getStreams(): Promise<Stream[]> {
    return Array.from(this.streams.values());
  }

  async getActiveStreams(): Promise<Stream[]> {
    return Array.from(this.streams.values()).filter(stream => stream.status === "live");
  }

  async getStreamById(id: string): Promise<Stream | undefined> {
    return this.streams.get(id);
  }

  async getStreamsByUser(userId: string): Promise<Stream[]> {
    return Array.from(this.streams.values()).filter(stream => stream.userId === userId);
  }

  async createStream(insertStream: InsertStream): Promise<Stream> {
    const stream: Stream = {
      ...insertStream,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.streams.set(stream.id, stream);
    return stream;
  }

  async updateStream(id: string, streamData: Partial<Stream>): Promise<Stream | undefined> {
    const stream = this.streams.get(id);
    if (!stream) return undefined;
    
    const updatedStream = { ...stream, ...streamData };
    this.streams.set(id, updatedStream);
    return updatedStream;
  }

  // Notification methods
  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return Array.from(this.notifications.values()).filter(notification => notification.userId === userId);
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const notification: Notification = {
      ...insertNotification,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.notifications.set(notification.id, notification);
    return notification;
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.read = true;
    this.notifications.set(id, notification);
    return true;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    let count = 0;
    this.notifications.forEach((n, id) => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        this.notifications.set(id, n);
        count++;
      }
    });
    return count;
  }

  async deleteNotification(id: string): Promise<boolean> {
    return this.notifications.delete(id);
  }
}

export const storage = new MemStorage();
