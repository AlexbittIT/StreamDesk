import { storage } from "./database";

export async function seedDatabase() {
  try {
    console.log("Seeding database with sample data...");

    // Create sample systems
    const systems = [
      {
        name: "Стриминговый сервер #1",
        type: "streaming",
        location: "Студия А, Стойка 1",
        status: "online",
        ipAddress: "192.168.1.100",
        specifications: {
          cpu: "Intel i7-12700K",
          ram: "32GB DDR4",
          storage: "2TB NVMe SSD",
          os: "Ubuntu 22.04 LTS"
        }
      },
      {
        name: "Сервер записи",
        type: "recording", 
        location: "Студия B, Стойка 2",
        status: "online",
        ipAddress: "192.168.1.101",
        specifications: {
          cpu: "AMD Ryzen 9 5900X",
          ram: "64GB DDR4",
          storage: "4TB NVMe SSD",
          os: "Windows Server 2022"
        }
      },
      {
        name: "Файловый сервер",
        type: "storage",
        location: "Серверная",
        status: "maintenance",
        ipAddress: "192.168.1.102",
        specifications: {
          cpu: "Intel Xeon E5-2620",
          ram: "128GB DDR4",
          storage: "20TB RAID 6",
          os: "TrueNAS Scale"
        }
      },
      {
        name: "База данных",
        type: "database",
        location: "Серверная",
        status: "online",
        ipAddress: "192.168.1.103",
        specifications: {
          cpu: "Intel i9-12900K",
          ram: "64GB DDR5",
          storage: "1TB NVMe SSD",
          os: "Ubuntu 22.04 LTS"
        }
      }
    ];

    for (const system of systems) {
      await storage.createSystem(system);
    }

    // Create sample equipment
    const equipment = [
      {
        name: "Sony FX3 Camera #1",
        type: "camera",
        model: "Sony FX3",
        serialNumber: "SN001234",
        status: "available",
        location: "Студия А",
        photos: ["/uploads/sony-fx3-1.jpg", "/uploads/sony-fx3-2.jpg"]
      },
      {
        name: "Audio-Technica AT2020",
        type: "microphone", 
        model: "AT2020",
        serialNumber: "MIC001",
        status: "in-use",
        location: "Подкаст зона",
        photos: ["/uploads/at2020.jpg"]
      },
      {
        name: "Elgato Key Light Air",
        type: "lighting",
        model: "Key Light Air",
        serialNumber: "LED001",
        status: "available",
        location: "Студия А",
        photos: []
      },
      {
        name: "MacBook Pro M2",
        type: "computer",
        model: "MacBook Pro 16\"",
        serialNumber: "MAC001",
        status: "in-use",
        location: "Мобильная съемка",
        photos: ["/uploads/macbook-pro.jpg"]
      },
      {
        name: "ATEM Mini Pro",
        type: "other",
        model: "ATEM Mini Pro",
        serialNumber: "ATEM001",
        status: "maintenance",
        location: "Техническая",
        photos: []
      }
    ];

    for (const item of equipment) {
      await storage.createEquipment(item);
    }

    // Create sample events
    const events = [
      {
        title: "Еженедельный подкаст",
        description: "Запись еженедельного подкаста о технологиях",
        type: "recording",
        status: "scheduled",
        location: "Подкаст зона",
        startTime: new Date(Date.now() + 2 * 60 * 60 * 1000), // через 2 часа
        endTime: new Date(Date.now() + 4 * 60 * 60 * 1000), // через 4 часа
        userId: null
      },
      {
        title: "Прямой эфир с экспертами",
        description: "Обсуждение новостей индустрии",
        type: "stream",
        status: "scheduled",
        location: "Студия А",
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // завтра
        endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        userId: null
      },
      {
        title: "Техническое обслуживание",
        description: "Плановое обслуживание оборудования",
        type: "maintenance",
        status: "scheduled", 
        location: "Техническая",
        startTime: new Date(Date.now() + 72 * 60 * 60 * 1000), // через 3 дня
        endTime: new Date(Date.now() + 76 * 60 * 60 * 1000),
        userId: null
      }
    ];

    for (const event of events) {
      await storage.createEvent(event);
    }

    // Create sample notifications
    const notifications = [
      {
        title: "Система в сети",
        message: "Файловый сервер восстановил работу после планового технического обслуживания.",
        type: "success",
        userId: null,
        read: false
      },
      {
        title: "Предстоящее событие",
        message: "Через 2 часа начнется запись еженедельного подкаста. Проверьте готовность оборудования.",
        type: "info", 
        userId: null,
        read: false
      },
      {
        title: "Требуется внимание",
        message: "ATEM Mini Pro находится на техническом обслуживании уже 3 дня. Проверьте статус ремонта.",
        type: "warning",
        userId: null,
        read: false
      },
      {
        title: "Низкое место на диске",
        message: "На файловом сервере осталось менее 15% свободного места. Рекомендуется очистка старых записей.",
        type: "warning",
        userId: null,
        read: true
      }
    ];

    for (const notification of notifications) {
      await storage.createNotification(notification);
    }

    // Create sample OBS connections
    const obsConnections = [
      {
        name: "OBS Studio - Главный",
        host: "192.168.1.100",
        port: 4455,
        password: "obs-password-123",
        status: "connected",
        streamStatus: "stopped"
      },
      {
        name: "OBS Studio - Резервный",
        host: "192.168.1.101", 
        port: 4455,
        password: "obs-backup-456",
        status: "disconnected",
        streamStatus: "stopped"
      }
    ];

    for (const obs of obsConnections) {
      await storage.createObsConnection(obs);
    }

    console.log("Database seeded successfully!");
    
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}