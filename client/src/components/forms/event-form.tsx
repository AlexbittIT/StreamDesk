import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { insertEventSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AuthService } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { z } from "zod";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { X, UserPlus } from "lucide-react";

const eventFormSchema = insertEventSchema.extend({
  startTime: z.string(),
  endTime: z.string(),
});

interface EventFormProps {
  isOpen: boolean;
  onClose: () => void;
  event?: any;
  selectedDate?: Date;
}

interface User {
  id: string;
  name: string;
  email: string;
  position: string;
  department: string;
}

export function EventForm({ isOpen, onClose, event, selectedDate }: EventFormProps) {
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(() => {
    const p = event?.participants;
    if (!p || !Array.isArray(p)) return [];
    return p.map((x: any) => (typeof x === "string" ? x : x.userId)).filter(Boolean);
  });
  const [useCustomLocation, setUseCustomLocation] = useState(!!event?.customLocation);
  const { toast } = useToast();

  useEffect(() => {
    const p = event?.participants;
    if (!p || !Array.isArray(p)) {
      setSelectedParticipants([]);
      return;
    }
    setSelectedParticipants(p.map((x: any) => (typeof x === "string" ? x : x.userId)).filter(Boolean));
  }, [event?.id, event?.participants]);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
  });

  const form = useForm<z.infer<typeof eventFormSchema>>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: event?.title || "",
      description: event?.description || "",
      startTime: event?.startTime 
        ? format(new Date(event.startTime), "yyyy-MM-dd'T'HH:mm")
        : selectedDate 
          ? format(selectedDate, "yyyy-MM-dd'T'09:00")
          : format(new Date(), "yyyy-MM-dd'T'09:00"),
      endTime: event?.endTime 
        ? format(new Date(event.endTime), "yyyy-MM-dd'T'HH:mm")
        : selectedDate 
          ? format(selectedDate, "yyyy-MM-dd'T'10:00")
          : format(new Date(Date.now() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
      location: event?.location || "Студия А",
      customLocation: event?.customLocation || "",
      organizerId: event?.organizerId || AuthService.getCurrentUser()?.id || "admin",
      type: event?.type || "stream",
      status: event?.status || "scheduled",
    },
  });

  const predefinedLocations = [
    "Студия А",
    "Студия B", 
    "Подкаст зона",
    "Конференц-зал",
    "Техническая",
    "Серверная",
    "Офис",
    "Удаленно"
  ];

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof eventFormSchema>) => {
      const eventData = {
        ...data,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
        location: useCustomLocation ? data.customLocation : data.location,
        participants: selectedParticipants.length > 0 ? selectedParticipants : undefined,
      };
      
      const response = await apiRequest("POST", "/api/events", eventData);
      const newEvent = await response.json();
      return newEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Успешно",
        description: "Событие создано",
      });
      onClose();
      form.reset();
      setSelectedParticipants([]);
    },
    onError: (error: any) => {
      console.error("Error creating event:", error);
      let errorMessage = "Не удалось создать событие";
      
      if (error.message) {
        if (error.message.includes("404")) {
          errorMessage = "Сервер не найден (404). Откройте приложение по адресу, где запущен сервер (например http://localhost:PORT из .env). Если деплой — укажите VITE_API_BASE в .env и пересоберите.";
        } else if (error.message.includes("timeout") || error.message.includes("время ожидания")) {
          errorMessage = "Операция заняла слишком много времени. Попробуйте снова или проверьте подключение к серверу.";
        } else if (error.message.includes("400")) {
          errorMessage = "Неверные данные. Проверьте заполнение всех обязательных полей.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof eventFormSchema>) => {
      const eventData = {
        ...data,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
        location: useCustomLocation ? data.customLocation : data.location,
        participants: selectedParticipants.length > 0 ? selectedParticipants : [],
      };
      
      const response = await apiRequest("PUT", `/api/events/${event.id}`, eventData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.refetchQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Успешно",
        description: "Событие обновлено",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить событие",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof eventFormSchema>) => {
    if (event?.id) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const addParticipant = (userId: string) => {
    if (!selectedParticipants.includes(userId)) {
      setSelectedParticipants([...selectedParticipants, userId]);
    }
  };

  const removeParticipant = (userId: string) => {
    setSelectedParticipants(selectedParticipants.filter(id => id !== userId));
  };

  const getSelectedUser = (userId: string) => users.find(u => u.id === userId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
        <DialogHeader>
          <DialogTitle>
            {event?.id ? "Редактировать событие" : "Создать событие"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название события *</FormLabel>
                  <FormControl>
                    <Input placeholder="Еженедельный подкаст" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Подробное описание события..."
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Начало *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" step="60" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Окончание *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" step="60" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип события</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите тип" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="stream">Стрим</SelectItem>
                        <SelectItem value="recording">Запись</SelectItem>
                        <SelectItem value="meeting">Встреча</SelectItem>
                        <SelectItem value="maintenance">Обслуживание</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Статус</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите статус" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Запланировано</SelectItem>
                        <SelectItem value="active">Активно</SelectItem>
                        <SelectItem value="completed">Завершено</SelectItem>
                        <SelectItem value="cancelled">Отменено</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Выбор места */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="customLocation"
                  checked={useCustomLocation}
                  onCheckedChange={setUseCustomLocation}
                />
                <label htmlFor="customLocation" className="text-sm font-medium">
                  Указать свое место
                </label>
              </div>

              {useCustomLocation ? (
                <FormField
                  control={form.control}
                  name="customLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Место проведения *</FormLabel>
                      <FormControl>
                        <Input placeholder="Введите место проведения" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Место проведения *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите место" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {predefinedLocations.map((location) => (
                            <SelectItem key={location} value={location}>
                              {location}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Участники */}
            <div className="space-y-4">
              <FormLabel className="flex items-center">
                <UserPlus className="w-4 h-4 mr-2" />
                Участники события
              </FormLabel>
              
              {/* Выбранные участники */}
              {selectedParticipants.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedParticipants.map((userId) => {
                    const user = getSelectedUser(userId);
                    return user ? (
                      <Badge key={userId} variant="secondary" className="flex items-center gap-1">
                        {user.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0.5 hover:bg-transparent"
                          onClick={() => removeParticipant(userId)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}

              {/* Список доступных пользователей */}
              <Select onValueChange={addParticipant}>
                <SelectTrigger>
                  <SelectValue placeholder="Добавить участника" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter(user => !selectedParticipants.includes(user.id))
                    .map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex flex-col">
                          <span>{user.name}</span>
                          <span className="text-xs text-gray-500">
                            {user.position} - {user.department}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Отмена
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Сохранение..." 
                  : event?.id ? "Обновить" : "Создать"
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}