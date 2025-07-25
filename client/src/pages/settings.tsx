import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings as SettingsIcon, User, Bell, Shield, Palette, Globe } from "lucide-react";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Настройки</h2>
        <p className="text-gray-600">Управление настройками приложения и профиля</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
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
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dark-mode">Темная тема</Label>
                    <p className="text-sm text-gray-600">Использовать темную цветовую схему</p>
                  </div>
                  <Switch id="dark-mode" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="compact-mode">Компактный вид</Label>
                    <p className="text-sm text-gray-600">Уменьшить отступы и размеры элементов</p>
                  </div>
                  <Switch id="compact-mode" />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="animations">Анимации</Label>
                    <p className="text-sm text-gray-600">Включить анимации интерфейса</p>
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

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="w-5 h-5 mr-2" />
                Интеграции
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
