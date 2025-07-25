import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./database";
import { 
  insertEventSchema, 
  insertEquipmentSchema, 
  insertStreamSchema, 
  insertNotificationSchema,
  insertEquipmentReservationSchema,
  insertTelegramUserSchema,
  insertObsConnectionSchema,
  insertAnalyticsEventSchema 
} from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import net from "net";

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads');
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error('Error creating upload directory:', error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Helper function to check IP connectivity
async function checkIP(ip: string, port: number = 80): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, ip);
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // In a real app, you'd use proper session management
      res.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const systems = await storage.getSystems();
      const equipment = await storage.getEquipment();
      const streams = await storage.getActiveStreams();
      const events = await storage.getEventsByDateRange(
        new Date(new Date().setHours(0, 0, 0, 0)),
        new Date(new Date().setHours(23, 59, 59, 999))
      );

      const onlineSystems = systems.filter(s => s.status === "online").length;
      const availableEquipment = equipment.filter(e => e.status === "available").length;

      res.json({
        onlineSystems: `${onlineSystems}/${systems.length}`,
        activeStreams: streams.length,
        availableEquipment: `${availableEquipment}/${equipment.length}`,
        todayEvents: events.length,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Events
  app.get("/api/events", async (req, res) => {
    try {
      const { userId, start, end } = req.query;
      
      let events;
      if (userId) {
        events = await storage.getEventsByUser(userId as string);
      } else if (start && end) {
        events = await storage.getEventsByDateRange(new Date(start as string), new Date(end as string));
      } else {
        events = await storage.getEvents();
      }
      
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  app.post("/api/events", async (req, res) => {
    try {
      const eventData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(eventData);
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid event data" });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const event = await storage.updateEvent(id, req.body);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  app.delete("/api/events/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteEvent(id);
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // Equipment
  app.get("/api/equipment", async (req, res) => {
    try {
      const { status } = req.query;
      let equipment;
      
      if (status) {
        equipment = await storage.getEquipmentByStatus(status as string);
      } else {
        equipment = await storage.getEquipment();
      }
      
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  app.post("/api/equipment", async (req, res) => {
    try {
      const equipmentData = insertEquipmentSchema.parse(req.body);
      const equipment = await storage.createEquipment(equipmentData);
      res.json(equipment);
    } catch (error) {
      res.status(400).json({ message: "Invalid equipment data" });
    }
  });

  app.put("/api/equipment/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const equipment = await storage.updateEquipment(id, req.body);
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }
      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update equipment" });
    }
  });

  // Systems
  app.get("/api/systems", async (req, res) => {
    try {
      const systems = await storage.getSystems();
      res.json(systems);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch systems" });
    }
  });

  app.put("/api/systems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const system = await storage.updateSystem(id, req.body);
      if (!system) {
        return res.status(404).json({ message: "System not found" });
      }
      res.json(system);
    } catch (error) {
      res.status(500).json({ message: "Failed to update system" });
    }
  });

  // Streams
  app.get("/api/streams", async (req, res) => {
    try {
      const { active, userId } = req.query;
      let streams;
      
      if (active === "true") {
        streams = await storage.getActiveStreams();
      } else if (userId) {
        streams = await storage.getStreamsByUser(userId as string);
      } else {
        streams = await storage.getStreams();
      }
      
      res.json(streams);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch streams" });
    }
  });

  app.post("/api/streams", async (req, res) => {
    try {
      const streamData = insertStreamSchema.parse(req.body);
      const stream = await storage.createStream(streamData);
      res.json(stream);
    } catch (error) {
      res.status(400).json({ message: "Invalid stream data" });
    }
  });

  app.put("/api/streams/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const stream = await storage.updateStream(id, req.body);
      if (!stream) {
        return res.status(404).json({ message: "Stream not found" });
      }
      res.json(stream);
    } catch (error) {
      res.status(500).json({ message: "Failed to update stream" });
    }
  });

  // External API integrations
  app.get("/api/integrations/youtube/stats", async (req, res) => {
    try {
      // Mock YouTube API response - in real app would use YouTube Data API
      const youtubeStats = {
        viewers: Math.floor(Math.random() * 2000) + 500,
        duration: "1ч 25м",
        status: "live",
        bitrate: "6000 kbps",
        fps: 60,
      };
      res.json(youtubeStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch YouTube stats" });
    }
  });

  app.get("/api/integrations/vk/stats", async (req, res) => {
    try {
      // Mock VK API response - in real app would use VK API
      const vkStats = {
        viewers: Math.floor(Math.random() * 1500) + 300,
        duration: "1ч 25м", 
        status: "live",
        bitrate: "5800 kbps",
        fps: 60,
      };
      res.json(vkStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch VK stats" });
    }
  });

  // Notifications
  app.get("/api/notifications/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const notification = await storage.createNotification(notificationData);
      res.json(notification);
    } catch (error) {
      res.status(400).json({ message: "Invalid notification data" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const { id } = req.params;
      const success = await storage.markNotificationRead(id);
      if (!success) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Equipment Photo Upload
  app.post("/api/equipment/:id/photos", upload.single('photo'), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ message: "No photo file provided" });
      }

      const photoUrl = `/uploads/${req.file.filename}`;
      const equipment = await storage.uploadEquipmentPhoto(id, photoUrl);
      
      if (!equipment) {
        return res.status(404).json({ message: "Equipment not found" });
      }

      res.json(equipment);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Equipment Reservations
  app.get("/api/equipment-reservations", async (req, res) => {
    try {
      const { equipmentId } = req.query;
      let reservations;
      
      if (equipmentId) {
        reservations = await storage.getEquipmentReservationsByEquipment(equipmentId as string);
      } else {
        reservations = await storage.getEquipmentReservations();
      }
      
      res.json(reservations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch equipment reservations" });
    }
  });

  app.post("/api/equipment-reservations", async (req, res) => {
    try {
      const reservationData = insertEquipmentReservationSchema.parse(req.body);
      
      // Check for conflicts
      const conflicts = await storage.checkEquipmentConflicts(
        reservationData.equipmentId!,
        new Date(reservationData.startTime),
        new Date(reservationData.endTime)
      );
      
      if (conflicts.length > 0) {
        return res.status(409).json({ 
          message: "Equipment is already reserved for this time period",
          conflicts 
        });
      }
      
      const reservation = await storage.createEquipmentReservation(reservationData);
      res.json(reservation);
    } catch (error) {
      res.status(400).json({ message: "Invalid reservation data" });
    }
  });

  // System Management
  app.post("/api/systems", async (req, res) => {
    try {
      const systemData = req.body;
      const system = await storage.createSystem(systemData);
      res.json(system);
    } catch (error) {
      res.status(400).json({ message: "Invalid system data" });
    }
  });

  app.delete("/api/systems/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteSystem(id);
      if (!deleted) {
        return res.status(404).json({ message: "System not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete system" });
    }
  });

  app.post("/api/systems/:id/ping", async (req, res) => {
    try {
      const { id } = req.params;
      const system = await storage.getSystemById(id);
      
      if (!system || !system.ipAddress) {
        return res.status(404).json({ message: "System not found or no IP address" });
      }

      const isOnline = await checkIP(system.ipAddress);
      const status = isOnline ? "online" : "offline";
      
      const updatedSystem = await storage.pingSystem(id, status);
      res.json({ system: updatedSystem, status });
    } catch (error) {
      res.status(500).json({ message: "Failed to ping system" });
    }
  });

  // Telegram Authentication
  app.post("/api/auth/telegram", async (req, res) => {
    try {
      const telegramData = insertTelegramUserSchema.parse(req.body);
      
      // Check if telegram user already exists
      let telegramUser = await storage.getTelegramUserByTelegramId(telegramData.telegramId);
      
      if (!telegramUser) {
        telegramUser = await storage.createTelegramUser(telegramData);
      }
      
      res.json(telegramUser);
    } catch (error) {
      res.status(400).json({ message: "Invalid telegram data" });
    }
  });

  app.post("/api/auth/telegram/link", async (req, res) => {
    try {
      const { telegramId, userId } = req.body;
      const telegramUser = await storage.linkTelegramUser(telegramId, userId);
      
      if (!telegramUser) {
        return res.status(404).json({ message: "Telegram user not found" });
      }
      
      res.json(telegramUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to link telegram user" });
    }
  });

  // OBS Studio Integration
  app.get("/api/obs/connections", async (req, res) => {
    try {
      const connections = await storage.getObsConnections();
      res.json(connections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch OBS connections" });
    }
  });

  app.post("/api/obs/connections", async (req, res) => {
    try {
      const obsData = insertObsConnectionSchema.parse(req.body);
      const connection = await storage.createObsConnection(obsData);
      res.json(connection);
    } catch (error) {
      res.status(400).json({ message: "Invalid OBS connection data" });
    }
  });

  app.put("/api/obs/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const connection = await storage.updateObsConnection(id, req.body);
      if (!connection) {
        return res.status(404).json({ message: "OBS connection not found" });
      }
      res.json(connection);
    } catch (error) {
      res.status(500).json({ message: "Failed to update OBS connection" });
    }
  });

  app.delete("/api/obs/connections/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteObsConnection(id);
      if (!deleted) {
        return res.status(404).json({ message: "OBS connection not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete OBS connection" });
    }
  });

  // Analytics
  app.get("/api/analytics", async (req, res) => {
    try {
      const { entityType, startDate, endDate } = req.query;
      const events = await storage.getAnalyticsEvents(
        entityType as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.post("/api/analytics", async (req, res) => {
    try {
      const analyticsData = insertAnalyticsEventSchema.parse(req.body);
      const event = await storage.createAnalyticsEvent(analyticsData);
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid analytics data" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    // Send initial data
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));

    // Simulate real-time updates
    const interval = setInterval(async () => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Send system status updates
          const systems = await storage.getSystems();
          ws.send(JSON.stringify({ 
            type: 'systems_update', 
            data: systems 
          }));

          // Send stream stats updates
          const streams = await storage.getActiveStreams();
          ws.send(JSON.stringify({ 
            type: 'streams_update', 
            data: streams 
          }));

          // Send mock YouTube stats
          const youtubeStats = {
            viewers: Math.floor(Math.random() * 2000) + 500,
            bitrate: Math.floor(Math.random() * 1000) + 5000,
            fps: 60
          };
          ws.send(JSON.stringify({ 
            type: 'youtube_stats', 
            data: youtubeStats 
          }));

          // Send mock VK stats
          const vkStats = {
            viewers: Math.floor(Math.random() * 1500) + 300,
            bitrate: Math.floor(Math.random() * 800) + 5000,
            fps: 60
          };
          ws.send(JSON.stringify({ 
            type: 'vk_stats', 
            data: vkStats 
          }));

        } catch (error) {
          console.error('Error sending WebSocket update:', error);
        }
      }
    }, 10000); // Update every 10 seconds

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clearInterval(interval);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clearInterval(interval);
    });
  });

  return httpServer;
}
