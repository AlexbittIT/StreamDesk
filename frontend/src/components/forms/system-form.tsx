import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { insertSystemSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Activity, Server, Wifi } from "lucide-react";

const systemFormSchema = insertSystemSchema.extend({
  specifications: z.record(z.string()).optional(),
});

interface SystemFormProps {
  isOpen: boolean;
  onClose: () => void;
  system?: any;
}

export function SystemForm({ isOpen, onClose, system }: SystemFormProps) {
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<any>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof systemFormSchema>>({
    resolver: zodResolver(systemFormSchema),
    defaultValues: {
      name: "",
      type: "server",
      location: "",
      ipAddress: "",
      status: "offline",
      specifications: {},
    },
  });

  const updateSpecification = (key: string, value: string) => {
    const current = form.getValues("specifications") || {};
    const next = { ...current };
    if (value.trim()) {
      next[key] = value;
    } else {
      delete next[key];
    }
    form.setValue("specifications", next, { shouldDirty: true });
  };

  useEffect(() => {
    if (isOpen) {
      if (system) {
        form.reset({
          name: system.name || "",
          type: system.type || "server",
          location: system.location || "",
          ipAddress: system.ipAddress || "",
          status: system.status || "offline",
          specifications: system.specifications || {},
        });
      } else {
        form.reset({
          name: "",
          type: "server",
          location: "",
          ipAddress: "",
          status: "offline",
          specifications: {},
        });
      }
      setPingResult(null);
    }
  }, [form, isOpen, system?.id]);

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof systemFormSchema>) => {
      const response = await apiRequest("POST", "/api/systems", data);
      return response.json();
    },
    onSuccess: (newSystem) => {
      queryClient.setQueryData(["/api/systems"], (old: any[] | undefined) =>
        Array.isArray(old) ? [...old, newSystem] : [newSystem]
      );
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      setTimeout(() => queryClient.refetchQueries({ queryKey: ["/api/systems"] }), 300);
      toast({
        title: "Успешно",
        description: "Система добавлена",
      });
      onClose();
      form.reset({
        name: "",
        type: "server",
        location: "",
        ipAddress: "",
        status: "offline",
        specifications: {},
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить систему",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: z.infer<typeof systemFormSchema>) => {
      const response = await apiRequest("PUT", `/api/systems/${system.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      toast({
        title: "Успешно",
        description: "Система обновлена",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить систему",
        variant: "destructive",
      });
    },
  });

  const testConnection = async () => {
    const ipAddress = form.getValues("ipAddress");
    if (!ipAddress) {
      toast({
        title: "Ошибка",
        description: "Введите IP адрес",
        variant: "destructive",
      });
      return;
    }

    setIsPinging(true);
    try {
      const response = await apiRequest("POST", "/api/systems/ping", { ip: ipAddress });
      const result: any = await response.json();
      setPingResult(result);
      
      if (result.isOnline) {
        form.setValue("status", "online");
        toast({
          title: "Успешно",
          description: `Сервер онлайн (${result.responseTime}мс)`,
        });
      } else {
        form.setValue("status", "offline");
        toast({
          title: "Офлайн",
          description: result.error || "Сервер недоступен",
          variant: "destructive",  
        });
      }
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось проверить соединение",
        variant: "destructive",
      });
    } finally {
      setIsPinging(false);
    }
  };

  const onSubmit = (data: z.infer<typeof systemFormSchema>) => {
    if (system) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const specifications = form.watch("specifications") || {};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            {system ? "Редактировать систему" : "Добавить систему"}
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
                    <FormLabel>Название системы *</FormLabel>
                    <FormControl>
                      <Input placeholder="Игровой сервер #1" {...field} />
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
                    <FormLabel>Тип системы *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите тип" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="server">Сервер</SelectItem>
                        <SelectItem value="computer">Компьютер</SelectItem>
                        <SelectItem value="network">Сетевое оборудование</SelectItem>
                        <SelectItem value="storage">Хранилище</SelectItem>
                        <SelectItem value="streaming">Стрим сервер</SelectItem>
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
                  <FormItem>
                    <FormLabel>Местоположение *</FormLabel>
                    <FormControl>
                      <Input placeholder="Серверная стойка #2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="ipAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IP адрес</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input placeholder="192.168.1.100" {...field} />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={testConnection}
                          disabled={isPinging}
                          className="px-3"
                        >
                          {isPinging ? (
                            <Activity className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wifi className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {pingResult && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={pingResult.isOnline ? "default" : "destructive"}
                      className="text-xs"
                    >
                      {pingResult.isOnline ? "Онлайн" : "Офлайн"}
                    </Badge>
                    {pingResult.responseTime && (
                      <span className="text-xs text-gray-500">
                        {pingResult.responseTime}мс
                      </span>
                    )}
                  </div>
                )}
              </div>

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
                        <SelectItem value="online">Онлайн</SelectItem>
                        <SelectItem value="offline">Офлайн</SelectItem>
                        <SelectItem value="maintenance">На обслуживании</SelectItem>
                        <SelectItem value="error">Ошибка</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Характеристики системы */}
            <div className="space-y-4">
              <FormLabel>Характеристики системы</FormLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Процессор</label>
                  <Input
                    placeholder="Intel Core i7-12700K"
                    value={specifications.cpu || ""}
                    onChange={(e) => updateSpecification("cpu", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Оперативная память</label>
                  <Input
                    placeholder="32 GB DDR4"
                    value={specifications.ram || ""}
                    onChange={(e) => updateSpecification("ram", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Видеокарта</label>
                  <Input
                    placeholder="NVIDIA RTX 4070"
                    value={specifications.gpu || ""}
                    onChange={(e) => updateSpecification("gpu", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Хранилище</label>
                  <Input
                    placeholder="1TB NVMe SSD"
                    value={specifications.storage || ""}
                    onChange={(e) => updateSpecification("storage", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Операционная система</label>
                  <Input
                    placeholder="Ubuntu 22.04 LTS"
                    value={specifications.os || ""}
                    onChange={(e) => updateSpecification("os", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Порты</label>
                  <Input
                    placeholder="SSH: 22, HTTP: 80, HTTPS: 443"
                    value={specifications.ports || ""}
                    onChange={(e) => updateSpecification("ports", e.target.value)}
                  />
                </div>
              </div>
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
                  : system ? "Обновить" : "Добавить"
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
