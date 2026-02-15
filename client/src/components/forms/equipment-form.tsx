import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { insertEquipmentSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/equipment/photo-upload";
import { useState, useEffect, useRef } from "react";
import { z } from "zod";
import JsBarcode from "jsbarcode";
import { QrCode, Download, Printer, RefreshCw, ScanBarcode, MapPin } from "lucide-react";

const equipmentFormSchema = insertEquipmentSchema.extend({
  specifications: z.record(z.string()).optional(),
});

interface EquipmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  equipment?: any;
  mode?: "full" | "take_return";
}

function getCurrentUser() {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
  } catch {
    return null;
  }
}

function canEditEquipment(userRole: string | undefined): boolean {
  return userRole === 'admin' || userRole === 'tech_director';
}

function isAdmin(userRole: string | undefined): boolean {
  return userRole === 'admin';
}

export function EquipmentForm({ isOpen, onClose, equipment, mode = "full" }: EquipmentFormProps) {
  const [photos, setPhotos] = useState<string[]>(equipment?.photos || []);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const barcodeRef = useRef<SVGSVGElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (equipment) {
        setPhotos(equipment.photos || []);
        const existingBarcode = equipment.barcode || equipment.inventoryNumber || equipment.serialNumber || "";
        setBarcodeValue(existingBarcode);
      } else {
        setPhotos([]);
        setBarcodeValue("");
      }
    }
  }, [isOpen, equipment]);

  useEffect(() => {
    if (barcodeRef.current && barcodeValue && barcodeValue.length >= 3) {
      try {
        JsBarcode(barcodeRef.current, barcodeValue, {
          format: "CODE128",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 12,
          margin: 5,
          background: "#ffffff",
          lineColor: "#000000",
        });
      } catch (error) {
        console.error("Error generating barcode:", error);
      }
    }
  }, [barcodeValue]);

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

  useEffect(() => {
    if (equipment && isOpen) {
      form.reset({
        name: equipment.name || "",
        type: equipment.type || "other",
        model: equipment.model || "",
        serialNumber: equipment.serialNumber || "",
        inventoryNumber: equipment.inventoryNumber || "",
        specifications: equipment.specifications || {},
        notes: equipment.notes || "",
        status: equipment.status || "available",
        location: equipment.location || "",
      });
    } else if (!equipment && isOpen) {
      form.reset({
        name: "",
        type: "other",
        model: "",
        serialNumber: "",
        inventoryNumber: "",
        specifications: {},
        notes: "",
        status: "available",
        location: "",
      });
    }
  }, [equipment, isOpen, form]);

  const inventoryNumber = form.watch("inventoryNumber");
  const serialNumber = form.watch("serialNumber");

  useEffect(() => {
    const newBarcodeValue = inventoryNumber || serialNumber || "";
    if (newBarcodeValue !== barcodeValue) {
      setBarcodeValue(newBarcodeValue);
    }
  }, [inventoryNumber, serialNumber]);

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof equipmentFormSchema>) => {
      // Only admins can create/promote barcodes
      const payload = { 
        ...data, 
        photos,
        barcode: (userIsAdmin && barcodeValue) ? barcodeValue : undefined
      };
      const response = await apiRequest("POST", "/api/equipment", payload);
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
      setBarcodeValue("");
    },
    onError: (error: any) => {
      console.error("Error creating equipment:", error);
      let errorMessage = "Не удалось добавить оборудование";
      
      if (error.message) {
        if (error.message.includes("timeout") || error.message.includes("время ожидания")) {
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
    mutationFn: async (data: z.infer<typeof equipmentFormSchema>) => {
      // Only admins can update/promote barcodes
      const payload = { 
        ...data, 
        photos,
        barcode: (userIsAdmin && barcodeValue) ? barcodeValue : equipment?.barcode
      };
      const response = await apiRequest("PUT", `/api/equipment/${equipment.id}`, payload);
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

  const takeReturnMutation = useMutation({
    mutationFn: async (data: { location: string; action: 'take' | 'return' }) => {
      const response = await apiRequest("PUT", `/api/equipment/${equipment.id}`, {
        status: data.action === 'take' ? 'in-use' : 'available',
        location: data.location,
        assignedTo: data.action === 'take' ? currentUser?.id : null,
        lastUsed: new Date(),
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({
        title: "Успешно",
        description: variables.action === 'take' ? "Оборудование взято" : "Оборудование возвращено",
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

  const handleTakeReturn = (action: 'take' | 'return') => {
    const location = form.getValues("location") || "";
    if (!location && action === 'take') {
      toast({
        title: "Укажите локацию",
        description: "Необходимо указать место, куда берёте оборудование",
        variant: "destructive",
      });
      return;
    }
    takeReturnMutation.mutate({ location, action });
  };

  const generateBarcode = () => {
    const prefix = "EQ";
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    const newValue = `${prefix}${randomNum}`;
    setBarcodeValue(newValue);
    form.setValue("inventoryNumber", newValue);
  };

  const handleDownloadBarcode = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const link = document.createElement("a");
      link.download = `barcode-${barcodeValue}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handlePrintBarcode = () => {
    if (!barcodeRef.current) return;
    
    const svgData = new XMLSerializer().serializeToString(barcodeRef.current);
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const name = form.getValues("name") || "Оборудование";
    const model = form.getValues("model") || "";
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Печать штрих-кода</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              font-family: system-ui, -apple-system, sans-serif;
            }
            .barcode-container {
              text-align: center;
              padding: 20px;
            }
            .equipment-name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 8px;
            }
            .equipment-model {
              font-size: 14px;
              color: #666;
              margin-bottom: 15px;
            }
            @media print {
              body { margin: 0; padding: 20mm; }
            }
          </style>
        </head>
        <body>
          <div class="barcode-container">
            <div class="equipment-name">${name}</div>
            <div class="equipment-model">${model}</div>
            ${svgData}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const userCanEdit = canEditEquipment(currentUser?.role);
  const userIsAdmin = isAdmin(currentUser?.role);
  const isTakeReturnMode = mode === "take_return" || (equipment && !userCanEdit);

  if (isTakeReturnMode && equipment) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {equipment.status === 'in-use' ? 'Вернуть оборудование' : 'Взять оборудование'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <h3 className="font-semibold text-slate-900 dark:text-white">{equipment.name}</h3>
              {equipment.model && (
                <p className="text-sm text-slate-500 dark:text-slate-400">{equipment.model}</p>
              )}
              <Badge className={`mt-2 ${equipment.status === 'available' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                {equipment.status === 'available' ? 'Доступно' : 'Используется'}
              </Badge>
            </div>

            <Form {...form}>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-700 dark:text-slate-300">
                        <MapPin className="w-4 h-4 inline mr-1" />
                        Локация
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Студия А, Монтажная 2..."
                          className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                          {...field}
                          value={field.value || ""} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={onClose}
                  >
                    Отмена
                  </Button>
                  {equipment.status === 'in-use' ? (
                    <Button
                      type="button"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleTakeReturn('return')}
                      disabled={takeReturnMutation.isPending}
                    >
                      {takeReturnMutation.isPending ? "..." : "Вернуть"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="flex-1 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => handleTakeReturn('take')}
                      disabled={takeReturnMutation.isPending}
                    >
                      {takeReturnMutation.isPending ? "..." : "Взять"}
                    </Button>
                  )}
                </div>
              </div>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="text-slate-900 dark:text-white">
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
                    <FormLabel className="text-slate-700 dark:text-slate-300">Название *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Sony FX3 Camera #1" 
                        className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                        {...field} 
                      />
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
                    <FormLabel className="text-slate-700 dark:text-slate-300">Тип оборудования *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
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
                    <FormLabel className="text-slate-700 dark:text-slate-300">Модель</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Sony FX3" 
                        className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                        {...field}
                        value={field.value || ""} 
                      />
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
                    <FormLabel className="text-slate-700 dark:text-slate-300">Серийный номер</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="SN001234" 
                        className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                        {...field}
                        value={field.value || ""} 
                      />
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
                    <FormLabel className="text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <ScanBarcode className="w-4 h-4" />
                      Инвентарный номер / Штрих-код
                    </FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="INV-2024-001 или сканируйте" 
                          className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 font-mono"
                          {...field}
                          value={field.value || ""} 
                        />
                      </FormControl>
                      {userIsAdmin ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={generateBarcode}
                          title="Сгенерировать штрих-код (только администраторы)"
                          className="shrink-0"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled
                          title="Только администраторы могут генерировать штрих-коды"
                          className="shrink-0 opacity-50 cursor-not-allowed"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-700 dark:text-slate-300">Статус</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600">
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
                    <FormLabel className="text-slate-700 dark:text-slate-300">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Местоположение
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Студия А, Стойка 1" 
                        className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                        {...field}
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {barcodeValue && barcodeValue.length >= 3 && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Предпросмотр штрих-кода
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadBarcode}
                      className="h-8"
                    >
                      <Download className="w-3 h-3 mr-1" />
                      Скачать
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePrintBarcode}
                      className="h-8"
                    >
                      <Printer className="w-3 h-3 mr-1" />
                      Печать
                    </Button>
                  </div>
                </div>
                <div className="flex justify-center p-3 bg-white rounded border">
                  <svg ref={barcodeRef} data-testid="barcode-preview" />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-700 dark:text-slate-300">Примечания</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Дополнительная информация об оборудовании..."
                      className="min-h-[80px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                      {...field}
                      value={field.value || ""} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <PhotoUpload
              equipmentId={equipment?.id}
              existingPhotos={photos}
              onPhotosChange={setPhotos}
            />

            <div className="flex justify-end space-x-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                className="border-slate-300 dark:border-slate-600"
              >
                Отмена
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-primary hover:bg-primary/90 text-white"
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
