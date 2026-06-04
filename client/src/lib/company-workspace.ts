import { PERMISSIONS } from "@shared/schema";

export const COMPANY_NEED_OPTIONS = [
  { id: "projects", label: "Проекты и доски", description: "Проекты, колонки, задачи и переписка по задачам." },
  { id: "tasks", label: "Таск-менеджер", description: "Личные и командные задачи без внешней интеграции." },
  { id: "equipment", label: "Склад техники", description: "Учёт оборудования, корзина, выдача и штрихкоды." },
  { id: "monitoring", label: "Мониторинг", description: "Серверы, рабочие станции, нагрузка и heartbeat агентов." },
  { id: "streams", label: "Стриминг", description: "Потоки, эфир, технические статусы и операционные панели." },
  { id: "ai", label: "Нейросети", description: "Свои API-ключи, модели и доступ команды к AI." },
] as const;

export type CompanyWorkspaceProvider = {
  id: string;
  label: string;
  enabled: boolean;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
  apiKeyMasked?: string;
  ownership?: string;
};

export type CompanyWorkspaceConfig = {
  needs: string[];
  workspace: {
    selfDeleteAllowed: boolean;
    accessMode: string;
  };
  monitoring: {
    enabled: boolean;
    workspaceKey: string;
    heartbeatIntervalSec: number;
    allowWindowsAgent: boolean;
    allowLinuxAgent: boolean;
  };
  ai: {
    allowPlatformProviders: boolean;
    allowCompanyProviders: boolean;
    allowPersonalKeys: boolean;
    providers: CompanyWorkspaceProvider[];
  };
  integrations: {
    yougile: {
      enabled: boolean;
      apiUrl: string;
      apiKey: string;
      apiKeyMasked?: string;
      companyId: string;
      boardId: string;
      syncMode: string;
    };
    weeek: {
      enabled: boolean;
      apiUrl: string;
      apiKey: string;
      apiKeyMasked?: string;
      workspaceId: string;
      boardId: string;
      syncMode: string;
    };
  };
  limits: {
    maxMembers: number;
    maxProjects: number;
    storageGb: number;
    aiRequestsPerDay: number;
  };
};

export function createDefaultCompanyWorkspaceConfig(): CompanyWorkspaceConfig {
  return {
    needs: ["projects", "tasks"],
    workspace: {
      selfDeleteAllowed: true,
      accessMode: "company",
    },
    monitoring: {
      enabled: false,
      workspaceKey: "",
      heartbeatIntervalSec: 5,
      allowWindowsAgent: true,
      allowLinuxAgent: true,
    },
    ai: {
      allowPlatformProviders: true,
      allowCompanyProviders: true,
      allowPersonalKeys: true,
      providers: [
        {
          id: "openai",
          label: "OpenAI",
          enabled: false,
          baseUrl: "https://api.openai.com/v1",
          defaultModel: "gpt-5.5",
          apiKey: "",
          ownership: "company",
        },
        {
          id: "custom",
          label: "Custom API",
          enabled: false,
          baseUrl: "",
          defaultModel: "",
          apiKey: "",
          ownership: "company",
        },
      ],
    },
    integrations: {
      yougile: {
        enabled: false,
        apiUrl: "https://ru.yougile.com/api-v2",
        apiKey: "",
        companyId: "",
        boardId: "",
        syncMode: "two-way",
      },
      weeek: {
        enabled: false,
        apiUrl: "https://api.weeek.net/public/v1",
        apiKey: "",
        workspaceId: "",
        boardId: "",
        syncMode: "two-way",
      },
    },
    limits: {
      maxMembers: 50,
      maxProjects: 100,
      storageGb: 100,
      aiRequestsPerDay: 5000,
    },
  };
}

export type RoleOption = {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
  color?: string;
};

const ADMIN_ROLE_PERMISSIONS = [
  PERMISSIONS.ADMIN_PANEL,
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.USERS_MANAGE,
  PERMISSIONS.ROLES_MANAGE,
  PERMISSIONS.COMPANIES_MANAGE,
  PERMISSIONS.INTEGRATIONS_MANAGE,
  PERMISSIONS.PROJECTS_VIEW_ALL,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_EDIT,
  PERMISSIONS.TASKS_DELETE,
  PERMISSIONS.TASKS_ASSIGN,
  PERMISSIONS.EQUIPMENT_VIEW,
  PERMISSIONS.EQUIPMENT_CREATE,
  PERMISSIONS.EQUIPMENT_EDIT,
  PERMISSIONS.EQUIPMENT_DELETE,
  PERMISSIONS.EQUIPMENT_RESERVE,
  PERMISSIONS.EVENTS_VIEW,
  PERMISSIONS.EVENTS_CREATE,
  PERMISSIONS.EVENTS_EDIT,
  PERMISSIONS.EVENTS_DELETE,
  PERMISSIONS.STREAMS_VIEW,
  PERMISSIONS.STREAMS_MANAGE,
  PERMISSIONS.SYSTEMS_VIEW,
  PERMISSIONS.SYSTEMS_MANAGE,
  PERMISSIONS.SETTINGS_MANAGE,
];

const MANAGER_ROLE_PERMISSIONS = [
  PERMISSIONS.USERS_VIEW,
  PERMISSIONS.PROJECTS_VIEW_ALL,
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_EDIT,
  PERMISSIONS.TASKS_ASSIGN,
  PERMISSIONS.EQUIPMENT_VIEW,
  PERMISSIONS.EQUIPMENT_RESERVE,
  PERMISSIONS.EVENTS_VIEW,
  PERMISSIONS.EVENTS_CREATE,
  PERMISSIONS.EVENTS_EDIT,
  PERMISSIONS.STREAMS_VIEW,
  PERMISSIONS.STREAMS_MANAGE,
  PERMISSIONS.SYSTEMS_VIEW,
  PERMISSIONS.SYSTEMS_MANAGE,
];

const EMPLOYEE_ROLE_PERMISSIONS = [
  PERMISSIONS.TASKS_VIEW,
  PERMISSIONS.TASKS_CREATE,
  PERMISSIONS.TASKS_EDIT,
  PERMISSIONS.EQUIPMENT_VIEW,
  PERMISSIONS.EVENTS_VIEW,
  PERMISSIONS.STREAMS_VIEW,
  PERMISSIONS.SYSTEMS_VIEW,
];

export const FALLBACK_ROLE_OPTIONS: RoleOption[] = [
  {
    id: "role-admin",
    name: "admin",
    displayName: "Администратор",
    description: "Полный доступ к компании и сотрудникам.",
    permissions: ADMIN_ROLE_PERMISSIONS,
    isSystem: true,
    color: "#ef4444",
  },
  {
    id: "role-manager",
    name: "manager",
    displayName: "Менеджер",
    description: "Работа с проектами, досками и командой без доступа к платформе.",
    permissions: MANAGER_ROLE_PERMISSIONS,
    isSystem: true,
    color: "#8b5cf6",
  },
  {
    id: "role-employee",
    name: "employee",
    displayName: "Сотрудник",
    description: "Базовая рабочая роль.",
    permissions: EMPLOYEE_ROLE_PERMISSIONS,
    isSystem: true,
    color: "#3b82f6",
  },
];
