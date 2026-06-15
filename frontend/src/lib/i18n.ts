export type Language = 'ru' | 'en';

export interface Translations {
  [key: string]: string | Translations;
}

const translations: Record<Language, Translations> = {
  ru: {
    common: {
      save: 'Сохранить',
      cancel: 'Отмена',
      delete: 'Удалить',
      edit: 'Редактировать',
      create: 'Создать',
      search: 'Поиск',
      filter: 'Фильтр',
      loading: 'Загрузка...',
      error: 'Ошибка',
      success: 'Успешно',
      yes: 'Да',
      no: 'Нет',
    },
    nav: {
      dashboard: 'Панель управления',
      tasks: 'Задачи',
      calendar: 'Календарь',
      equipment: 'Склад техники',
      estimates: 'Смета',
      computers: 'Компьютеры',
      projects: 'Проекты',
      monitoring: 'Мониторинг системы',
      streams: 'Стриминг',
      servers: 'Серверы',
      chatgpt: 'ChatGPT',
      notifications: 'Уведомления',
      settings: 'Настройки',
      admin: 'Администрирование',
      vmixScheduler: 'Расписатель vMix',
    },
    dashboard: {
      title: 'Панель управления',
      stats: 'Статистика',
      activity: 'Активность',
      quickActions: 'Быстрые действия',
    },
    managerDashboard: {
      title: 'Дашборд менеджера',
      teamOverview: 'Обзор команды',
      performanceMetrics: 'Метрики производительности',
      taskStatistics: 'Статистика задач',
      teamActivity: 'Активность команды',
      productivityTrends: 'Тренды продуктивности',
      completedTasks: 'Выполнено задач',
      inProgress: 'В работе',
      overdue: 'Просрочено',
      totalTasks: 'Всего задач',
      averageCompletionTime: 'Среднее время выполнения',
      hours: 'часов',
      teamMembers: 'Участники команды',
      tasksByStatus: 'Задачи по статусам',
      tasksByPriority: 'Задачи по приоритетам',
      tasksByAssignee: 'Задачи по исполнителям',
      recentActivity: 'Недавняя активность',
      topPerformers: 'Лучшие исполнители',
      needsAttention: 'Требует внимания',
      noData: 'Нет данных',
    },
    tasks: {
      title: 'Задачи',
      create: 'Создать задачу',
      edit: 'Редактировать задачу',
      delete: 'Удалить задачу',
      assign: 'Назначить',
      status: 'Статус',
      priority: 'Приоритет',
      dueDate: 'Срок выполнения',
      assignee: 'Исполнитель',
      description: 'Описание',
      comments: 'Комментарии',
      history: 'История',
    },
    theme: {
      light: 'Светлая',
      dark: 'Тёмная',
      system: 'Системная',
      neon: 'Неоновая',
      neonCyan: 'Неоновая Cyan',
      neonPurple: 'Неоновая Purple',
      neonPink: 'Неоновая Pink',
      neonRainbow: 'Неоновая Rainbow',
      warm: 'Теплая (для зрения)',
      highContrast: 'Высокий контраст',
      sepia: 'Сепия',
      autoTheme: 'Авто по времени суток',
    },
  },
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      search: 'Search',
      filter: 'Filter',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      yes: 'Yes',
      no: 'No',
    },
    nav: {
      dashboard: 'Dashboard',
      tasks: 'Tasks',
      calendar: 'Calendar',
      equipment: 'Equipment',
      estimates: 'Estimate',
      computers: 'Computers',
      projects: 'Video Projects',
      monitoring: 'System Monitoring',
      streams: 'Streaming',
      servers: 'Servers',
      chatgpt: 'ChatGPT',
      notifications: 'Notifications',
      settings: 'Settings',
      admin: 'Administration',
      vmixScheduler: 'vMix Scheduler',
    },
    dashboard: {
      title: 'Dashboard',
      stats: 'Statistics',
      activity: 'Activity',
      quickActions: 'Quick Actions',
    },
    managerDashboard: {
      title: 'Manager Dashboard',
      teamOverview: 'Team Overview',
      performanceMetrics: 'Performance Metrics',
      taskStatistics: 'Task Statistics',
      teamActivity: 'Team Activity',
      productivityTrends: 'Productivity Trends',
      completedTasks: 'Completed Tasks',
      inProgress: 'In Progress',
      overdue: 'Overdue',
      totalTasks: 'Total Tasks',
      averageCompletionTime: 'Average Completion Time',
      hours: 'hours',
      teamMembers: 'Team Members',
      tasksByStatus: 'Tasks by Status',
      tasksByPriority: 'Tasks by Priority',
      tasksByAssignee: 'Tasks by Assignee',
      recentActivity: 'Recent Activity',
      topPerformers: 'Top Performers',
      needsAttention: 'Needs Attention',
      noData: 'No data',
    },
    tasks: {
      title: 'Tasks',
      create: 'Create Task',
      edit: 'Edit Task',
      delete: 'Delete Task',
      assign: 'Assign',
      status: 'Status',
      priority: 'Priority',
      dueDate: 'Due Date',
      assignee: 'Assignee',
      description: 'Description',
      comments: 'Comments',
      history: 'History',
    },
    theme: {
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      neon: 'Neon',
      neonCyan: 'Neon Cyan',
      neonPurple: 'Neon Purple',
      neonPink: 'Neon Pink',
      neonRainbow: 'Neon Rainbow',
      warm: 'Warm (Eye Care)',
      highContrast: 'High Contrast',
      sepia: 'Sepia',
      autoTheme: 'Auto by Time of Day',
    },
  },
};

class I18n {
  private currentLanguage: Language = 'ru';

  constructor() {
    const saved = localStorage.getItem('streamstudio-language') as Language;
    if (saved && (saved === 'ru' || saved === 'en')) {
      this.currentLanguage = saved;
    }
  }

  setLanguage(lang: Language) {
    this.currentLanguage = lang;
    localStorage.setItem('streamstudio-language', lang);
  }

  getLanguage(): Language {
    return this.currentLanguage;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const keys = key.split('.');
    let value: any = translations[this.currentLanguage];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Возвращаем ключ, если перевод не найден
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Заменяем параметры в строке
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey]?.toString() || match;
      });
    }

    return value;
  }
}

export const i18n = new I18n();

