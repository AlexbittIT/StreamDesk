import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface PingResult {
  ip: string;
  isOnline: boolean;
  responseTime?: number;
  error?: string;
}

export async function pingHost(ip: string): Promise<PingResult> {
  try {
    // Проверяем валидность IP адреса
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return {
        ip,
        isOnline: false,
        error: "Неверный формат IP адреса"
      };
    }

    // Выполняем ping команду
    const { stdout, stderr } = await execAsync(`ping -c 1 -W 3 ${ip}`);
    
    if (stderr) {
      return {
        ip,
        isOnline: false,
        error: stderr
      };
    }

    // Парсим результат ping
    const timeMatch = stdout.match(/time=([0-9.]+)\s*ms/);
    const responseTime = timeMatch ? parseFloat(timeMatch[1]) : undefined;

    return {
      ip,
      isOnline: true,
      responseTime
    };

  } catch (error: any) {
    // Ping неудачен - хост недоступен
    return {
      ip,
      isOnline: false,
      error: error.message || "Хост недоступен"
    };
  }
}

export async function pingMultipleHosts(ips: string[]): Promise<PingResult[]> {
  const pingPromises = ips.map(ip => pingHost(ip));
  return Promise.all(pingPromises);
}

// Функция для проверки TCP порта
export async function checkTcpPort(ip: string, port: number): Promise<boolean> {
  try {
    const { stdout, stderr } = await execAsync(`nc -z -w3 ${ip} ${port}`);
    return !stderr;
  } catch (error) {
    return false;
  }
}

// Функция для получения информации о сети
export async function getNetworkInfo(ip: string): Promise<any> {
  try {
    const { stdout } = await execAsync(`nmap -sn ${ip}`);
    return {
      ip,
      info: stdout,
      scanTime: new Date()
    };
  } catch (error) {
    return {
      ip,
      error: error,
      scanTime: new Date()
    };
  }
}