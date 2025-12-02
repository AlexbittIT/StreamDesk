import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertEquipmentSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/equipment/photo-upload";
import { useState } from "react";
import { z } from "zod";

const equipmentFormSchema = insertEquipmentSchema.extend({
  specifications: z.record(z.string()).optional(),
});

interface EquipmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  equipment?: any;
}

export function EquipmentForm({ isOpen, onClose, equipment }: EquipmentFormProps) {
  const [photos, setPhotos] = useState<string[]>(equipment?.photos || []);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof equipmentFormSchema>>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: equipment?.name || "",
      type: equipment?.type || "other",
      model: equipment?.model || "",
      serialNumber: equipment?.serialNumber || "",
      inventoryNumber: equipment?.inventoryNumber || "",
      specifications: equipment?.specifications || {},
      notes: equipment?.notes || "",
      status: equipment?.status || "available",
      location: equipment?.location || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof equipmentFormSchema>) => {
      const response = await apiRequest("POST", "/api/equipment", { ...data, photos });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: "Успешно",
        description: "Оборудование добавлено",
      });
      onClose();
      form.reset();
      setPhotos([]);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить оборудование",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof equipmentFormSchema>) => {
      const response = await apiRequest("PUT", `/api/equipment/${equipment.id}`, { ...data, photos });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: "Успешно",
        description: "Оборудование обновлено",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить оборудование",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof equipmentFormSchema>) => {
    if (equipment) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {equipment ? "Редактировать оборудование" : "Добавить оборудование"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название *</FormLabel>
                    <FormControl>
                      <Input placeholder="Sony FX3 Camera #1" {...field} />
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
                    <FormLabel>Тип оборудования *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите тип" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="camera">Камера</SelectItem>
                        <SelectItem value="microphone">Микрофон</SelectItem>
                        <SelectItem value="lighting">Освещение</SelectItem>
                        <SelectItem value="computer">Компьютер</SelectItem>
                        <SelectItem value="audio">Аудиооборудование</SelectItem>
                        <SelectItem value="video">Видеооборудование</SelectItem>
                        <SelectItem value="other">Другое</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Модель</FormLabel>
                    <FormControl>
                      <Input placeholder="Sony FX3" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serialNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Серийный номер</FormLabel>
                    <FormControl>
                      <Input placeholder="SN001234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="inventoryNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Инвентарный номер</FormLabel>
                    <FormControl>
                      <Input placeholder="INV-2024-001" {...field} />
                    </FormControl>
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
                        <SelectItem value="available">Доступно</SelectItem>
                        <SelectItem value="in-use">Используется</SelectItem>
                        <SelectItem value="maintenance">На обслуживании</SelectItem>
                        <SelectItem value="broken">Сломано</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Местоположение</FormLabel>
                    <FormControl>
                      <Input placeholder="Студия А, Стойка 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Характеристики */}
            <div className="space-y-4">
              <FormLabel>Характеристики</FormLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Разрешение</label>
                  <Input placeholder="4K UHD" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Частота кадров</label>
                  <Input placeholder="60 fps" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Тип подключения</label>
                  <Input placeholder="HDMI, USB-C" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Питание</label>
                  <Input placeholder="Аккумулятор NP-FZ100" />
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Примечания</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Дополнительная информация об оборудовании..."
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Загрузка фотографий */}
            <PhotoUpload
              equipmentId={equipment?.id}
              existingPhotos={photos}
              onPhotosChange={setPhotos}
            />

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
                  : equipment ? "Обновить" : "Добавить"
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}