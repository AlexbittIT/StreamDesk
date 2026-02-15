import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp, 
  BarChart3,
  Activity,
  Target,
  Award,
  AlertTriangle
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

interface ManagerStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  averageCompletionTime: number;
  tasksByStatus: { status: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  tasksByAssignee: { assigneeId: string; assigneeName: string; count: number }[];
  recentActivity: {
    id: string;
    action: string;
    userName: string;
    taskTitle: string;
    timestamp: string;
  }[];
  topPerformers: {
    userId: string;
    userName: string;
    completedTasks: number;
    avatar?: string;
  }[];
  needsAttention: {
    id: string;
    title: string;
    assigneeName: string;
    dueDate: string;
    priority: string;
  }[];
}

export default function ManagerDashboard() {
  const { t } = useI18n();
  
  const { data: stats, isLoading } = useQuery<ManagerStats>({
    queryKey: ["/api/manager/stats"],
    retry: 1,
    retryDelay: 1000,
  });

  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users"],
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const statsData = stats || {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    overdueTasks: 0,
    averageCompletionTime: 0,
    tasksByStatus: [],
    tasksByPriority: [],
    tasksByAssignee: [],
    recentActivity: [],
    topPerformers: [],
    needsAttention: [],
  };

  const getPriorityColor = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/50';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('managerDashboard.title')}</h1>
        <p className="text-muted-foreground mt-1">{t('managerDashboard.teamOverview')}</p>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('managerDashboard.totalTasks')}</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.totalTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {statsData.completedTasks} {t('managerDashboard.completedTasks').toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('managerDashboard.inProgress')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.inProgressTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((statsData.inProgressTasks / statsData.totalTasks) * 100 || 0).toFixed(0)}% от общего числа
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('managerDashboard.overdue')}</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{statsData.overdueTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Требуют внимания
            </p>
          </CardContent>
        </Card>

        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('managerDashboard.averageCompletionTime')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsData.averageCompletionTime.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('managerDashboard.hours')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Графики и статистика */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Задачи по статусам */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="w-5 h-5 mr-2" />
              {t('managerDashboard.tasksByStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsData.tasksByStatus.length > 0 ? (
              <div className="space-y-3">
                {statsData.tasksByStatus.map((item) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{item.status}</span>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{
                            width: `${(item.count / statsData.totalTasks) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('managerDashboard.noData')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Задачи по приоритетам */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="w-5 h-5 mr-2" />
              {t('managerDashboard.tasksByPriority')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsData.tasksByPriority.length > 0 ? (
              <div className="space-y-3">
                {statsData.tasksByPriority.map((item) => (
                  <div key={item.priority} className="flex items-center justify-between">
                    <Badge className={cn("capitalize", getPriorityColor(item.priority))}>
                      {item.priority}
                    </Badge>
                    <div className="flex items-center space-x-2">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", {
                            'bg-red-500': item.priority.toLowerCase() === 'high',
                            'bg-yellow-500': item.priority.toLowerCase() === 'medium',
                            'bg-green-500': item.priority.toLowerCase() === 'low',
                          })}
                          style={{
                            width: `${(item.count / statsData.totalTasks) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold w-8 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('managerDashboard.noData')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Лучшие исполнители и задачи требующие внимания */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Лучшие исполнители */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Award className="w-5 h-5 mr-2" />
              {t('managerDashboard.topPerformers')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsData.topPerformers.length > 0 ? (
              <div className="space-y-4">
                {statsData.topPerformers.map((performer, index) => (
                  <div key={performer.userId} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={performer.avatar} />
                          <AvatarFallback>
                            {performer.userName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        {index < 3 && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                            {index + 1}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{performer.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {performer.completedTasks} {t('managerDashboard.completedTasks').toLowerCase()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">{performer.completedTasks}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('managerDashboard.noData')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Требует внимания */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-yellow-500" />
              {t('managerDashboard.needsAttention')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsData.needsAttention.length > 0 ? (
              <div className="space-y-3">
                {statsData.needsAttention.slice(0, 5).map((task) => (
                  <div key={task.id} className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{task.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.assigneeName} • {new Date(task.dueDate).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={cn("ml-2", getPriorityColor(task.priority))}>
                        {task.priority}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Нет задач, требующих внимания
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Недавняя активность */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Activity className="w-5 h-5 mr-2" />
            {t('managerDashboard.recentActivity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsData.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {statsData.recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{activity.userName}</span>
                      {' '}
                      <span className="text-muted-foreground">{activity.action}</span>
                      {' '}
                      <span className="font-medium">{activity.taskTitle}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('managerDashboard.noData')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

