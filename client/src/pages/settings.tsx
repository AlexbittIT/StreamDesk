import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Globe, Smartphone, Languages } from "lucide-react";
import { TelegramAuth } from "@/components/auth/telegram-auth";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-gray-600">Управление настройками приложения и профиля</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile" className="flex items-center space-x-2">
            <User className="w-4 h-4" />
            <span className="hidden sm:inline">Профиль</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center space-x-2">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Уведомления</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center space-x-2">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Безопасность</span>
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center space-x-2">
            <Palette className="w-4 h-4" />
            <span className="hidden sm:inline">Внешний вид</span>
          </TabsTrigger>
          <TabsTrigger value="language" className="flex items-center space-x-2">
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">Язык</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center space-x-2">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">Интеграции</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="w-5 h-5 mr-2" />
                Профиль пользователя
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Полное имя</Label>
                  <Input id="name" defaultValue="Иван Петров" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Имя пользователя</Label>
                  <Input id="username" defaultValue="ivan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue="ivan@streamstudio.ru" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон</Label>
                  <Input id="phone" defaultValue="+7 (999) 123-45-67" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Роль</Label>
                <Input id="role" defaultValue="Администратор" disabled />
              </div>

              <div className="flex justify-end">
                <Button>Сохранить изменения</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Настройки уведомлений
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="email-notifications">Email уведомления</Label>
                    <p className="text-sm text-gray-600">Получать уведомления по электронной почте</p>
                  </div>
                  <Switch id="email-notifications" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="system-alerts">Системные предупреждения</Label>
                    <p className="text-sm text-gray-600">Уведомления о проблемах с системой</p>
                  </div>
                  <Switch id="system-alerts" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="stream-notifications">Уведомления о стримах</Label>
                    <p className="text-sm text-gray-600">Уведомления о начале и окончании стримов</p>
                  </div>
                  <Switch id="stream-notifications" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="calendar-reminders">Напоминания календаря</Label>
                    <p className="text-sm text-gray-600">Напоминания о предстоящих событиях</p>
                  </div>
                  <Switch id="calendar-reminders" defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="equipment-alerts">Уведомления об оборудовании</Label>
                    <p className="text-sm text-gray-600">Уведомления о статусе оборудования</p>
                  </div>
                  <Switch id="equipment-alerts" />
                </div>
              </div>

              {/* Push Notifications */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Label htmlFor="push-notifications">Push-уведомления в браузере</Label>
                      {!isSupported && (
                        <Badge variant="secondary" className="text-xs">Не поддерживается</Badge>
                      )}
                      {isSupported && isSubscribed && (
                        <Badge variant="default" className="text-xs bg-green-500">Включено</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">
                      Получать уведомления даже когда браузер закрыт
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSupported && (
                      <Button
                        onClick={() => isSubscribed ? unsubscribe() : subscribe()}
                        variant={isSubscribed ? "destructive" : "default"}
                        size="sm"
                      >
                        <Smartphone className="w-4 h-4 mr-2" />
                        {isSubscribed ? "Отключить" : "Включить"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Сохранить настройки</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="w-5 h-5 mr-2" />
                Безопасность
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Текущий пароль</Label>
                  <Input id="current-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Новый пароль</Label>
                  <Input id="new-password" type="password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Подтвердите новый пароль</Label>
                  <Input id="confirm-password" type="password" />
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="two-factor">Двухфакторная аутентификация</Label>
                    <p className="text-sm text-gray-600">Дополнительная защита вашего аккаунта</p>
                  </div>
                  <Switch id="two-factor" />
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button variant="outline">Отмена</Button>
                <Button>Обновить пароль</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="w-5 h-5 mr-2" />
                Внешний вид
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold mb-3 block">Выбор темы</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Используйте переключатель темы в правом верхнем углу для выбора темы
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all",
                      "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-primary"
                    )}>
                      <Sun className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                      <p className="text-xs text-center font-medium">Светлая</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all",
                      "bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 hover:border-primary"
                    )}>
                      <Moon className="w-6 h-6 mx-auto mb-2 text-blue-300" />
                      <p className="text-xs text-center font-medium text-white">Тёмная</p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-lg border-2 cursor-pointer transition-all neon-rainbow",
                      "bg-gradient-to-br from-cyan-900/50 via-purple-900/50 to-pink-900/50 border-cyan-500/50 hover:border-cyan-400"
                    )}>
                      <Sparkles className="w-6 h-6 mx-auto mb-2 text-cyan-400 animate-pulse" />
                      <p className="text-xs text-center font-medium text-cyan-300">Rainbow</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div>
                    <Label htmlFor="compact-mode">Компактный вид</Label>
                    <p className="text-sm text-muted-foreground">Уменьшить отступы и размеры элементов</p>
                  </div>
                  <Switch id="compact-mode" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="animations">Анимации</Label>
                    <p className="text-sm text-muted-foreground">Включить анимации интерфейса</p>
                  </div>
                  <Switch id="animations" defaultChecked />
                </div>
              </div>

              <div className="flex justify-end">
                <Button>Применить настройки</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="language">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Languages className="w-5 h-5 mr-2" />
                Язык интерфейса
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Выберите язык</Label>
                  <Select value={language} onValueChange={(value) => setLanguage(value as 'ru' | 'en')}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Выберите язык" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ru">Русский</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Изменения применятся сразу после выбора
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="space-y-6">
            {/* Telegram Integration */}
            <TelegramAuth onSuccess={(telegramUser) => {
              console.log('Telegram user connected:', telegramUser);
            }} />
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="w-5 h-5 mr-2" />
                  Платформы стриминга
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                {/* YouTube Integration */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                        <span className="text-red-600 text-lg font-bold">YT</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">YouTube</h3>
                        <p className="text-sm text-gray-600">Интеграция с YouTube для стримов</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="youtube-key">API Key</Label>
                    <Input id="youtube-key" placeholder="Введите YouTube API ключ" />
                  </div>
                </div>

                {/* VK Integration */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-blue-600 text-lg font-bold">VK</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">ВКонтакте</h3>
                        <p className="text-sm text-gray-600">Интеграция с ВКонтакте для стримов</p>
                      </div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vk-token">Access Token</Label>
                    <Input id="vk-token" placeholder="Введите VK access token" />
                  </div>
                </div>

                {/* Twitch Integration */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                        <span className="text-purple-600 text-lg font-bold">TW</span>
                      </div>
                      <div>
                        <h3 className="font-semibold">Twitch</h3>
                        <p className="text-sm text-gray-600">Интеграция с Twitch для стримов</p>
                      </div>
                    </div>
                    <Switch />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="twitch-token">Client ID</Label>
                    <Input id="twitch-token" placeholder="Введите Twitch Client ID" />
                  </div>
                </div>
              </div>

                <div className="flex justify-end">
                  <Button>Сохранить интеграции</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
