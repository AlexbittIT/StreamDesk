import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Plus, Cpu, HardDrive, Monitor, MemoryStick, 
  Wifi, Power, Settings, Edit, Trash2, ChevronDown, ChevronUp
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const computerSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  location: z.string().min(1, "Локация обязательна"),
  purpose: z.string().optional(),
  status: z.string().default("active"),
  components: z.object({
    cpu: z.string().optional(),
    gpu: z.string().optional(),
    ram: z.string().optional(),
    storage: z.string().optional(),
    motherboard: z.string().optional(),
    psu: z.string().optional(),
    case: z.string().optional(),
    os: z.string().optional(),
    monitors: z.string().optional(),
    peripherals: z.string().optional(),
  }).optional(),
  notes: z.string().optional(),
  ipAddress: z.string().optional(),
});

type ComputerFormData = z.infer<typeof computerSchema>;

const statusConfig = {
  active: { label: "Активен", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  maintenance: { label: "Обслуживание", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  offline: { label: "Выключен", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" },
  broken: { label: "Неисправен", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
};

const purposeOptions = [
  { value: "streaming", label: "Стриминг" },
  { value: "editing", label: "Монтаж" },
  { value: "graphics", label: "Графика" },
  { value: "gaming", label: "Игровой" },
  { value: "server", label: "Сервер" },
  { value: "office", label: "Офисный" },
  { value: "other", label: "Другое" },
];

export default function Computers() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedComputer, setSelectedComputer] = useState<any>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const { data: computers = [], isLoading } = useQuery({
    queryKey: ["/api/computers"],
  });

  const form = useForm<ComputerFormData>({
    resolver: zodResolver(computerSchema),
    defaultValues: {
      name: "",
      location: "",
      purpose: "",
      status: "active",
      components: {},
      notes: "",
      ipAddress: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ComputerFormData) => {
      const response = await apiRequest("POST", "/api/computers", data);
      return response.json();
    },
    onSuccess: (newComputer) => {
      queryClient.setQueryData(["/api/computers"], (old: any[] | undefined) =>
        Array.isArray(old) ? [...old, newComputer] : [newComputer]
      );
      queryClient.invalidateQueries({ queryKey: ["/api/computers"] });
      setTimeout(() => queryClient.refetchQueries({ queryKey: ["/api/computers"] }), 300);
      toast({ title: "Успешно", description: "Компьютер добавлен" });
      setIsFormOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось добавить компьютер", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ComputerFormData> }) => {
      const response = await apiRequest("PUT", `/api/computers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/computers"] });
      queryClient.refetchQueries({ queryKey: ["/api/computers"] });
      toast({ title: "Успешно", description: "Компьютер обновлён" });
      setSelectedComputer(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/computers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/computers"] });
      queryClient.refetchQueries({ queryKey: ["/api/computers"] });
      toast({ title: "Успешно", description: "Компьютер удалён" });
    },
  });

  const filteredComputers = (computers as any[]).filter((item) => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCards(newExpanded);
  };

  const onSubmit = (data: ComputerFormData) => {
    createMutation.mutate(data);
  };

  const ComponentIcon = ({ type }: { type: string }) => {
    switch (type) {
      case "cpu": return <Cpu className="w-4 h-4" />;
      case "gpu": return <Monitor className="w-4 h-4" />;
      case "ram": return <MemoryStick className="w-4 h-4" />;
      case "storage": return <HardDrive className="w-4 h-4" />;
      case "psu": return <Power className="w-4 h-4" />;
      default: return <Settings className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button variant="default" data-testid="button-add-computer">
              <Plus className="w-4 h-4 mr-2" />
              Добавить компьютер
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto hide-scrollbar">
            <DialogHeader>
              <DialogTitle>Добавить компьютер</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Название *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="PC-STREAM-01" data-testid="input-computer-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Локация *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Студия 1" data-testid="input-computer-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="purpose"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Назначение</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-purpose">
                              <SelectValue placeholder="Выберите назначение" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {purposeOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ipAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IP адрес</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="192.168.1.100" data-testid="input-ip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-foreground">Комплектующие</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="components.cpu"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm flex items-center gap-2">
                            <Cpu className="w-4 h-4" /> Процессор
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Intel i9-13900K" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.gpu"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm flex items-center gap-2">
                            <Monitor className="w-4 h-4" /> Видеокарта
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="RTX 4090" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.ram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm flex items-center gap-2">
                            <MemoryStick className="w-4 h-4" /> Оперативная память
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="64GB DDR5" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.storage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm flex items-center gap-2">
                            <HardDrive className="w-4 h-4" /> Накопители
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="2TB NVMe + 4TB HDD" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.motherboard"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Материнская плата</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="ASUS ROG Maximus" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.psu"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm flex items-center gap-2">
                            <Power className="w-4 h-4" /> Блок питания
                          </FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="1000W 80+ Gold" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.os"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">ОС</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Windows 11 Pro" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="components.monitors"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Мониторы</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="2x Dell 27'' 4K" className="text-sm" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Примечания</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Дополнительная информация..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Добавление..." : "Добавить компьютер"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="dark:border-border/50">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                {Object.entries(statusConfig).map(([key, conf]) => (
                  <SelectItem key={key} value={key}>{conf.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredComputers.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Monitor className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Компьютеры не найдены</p>
            <p className="text-sm text-muted-foreground mt-1">Добавьте первый компьютер</p>
          </div>
        ) : (
          filteredComputers.map((computer: any) => {
            const status = statusConfig[computer.status as keyof typeof statusConfig] || statusConfig.offline;
            const isExpanded = expandedCards.has(computer.id);
            const components = computer.components || {};

            return (
              <Card 
                key={computer.id} 
                className="dark:border-border/50 dark:hover:border-primary/50 transition-all hover:shadow-lg"
                data-testid={`computer-card-${computer.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 dark:bg-primary/20 rounded-lg flex items-center justify-center">
                        <Monitor className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{computer.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{computer.location}</p>
                      </div>
                    </div>
                    <Badge className={status.color}>{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {computer.purpose && (
                    <div className="flex items-center gap-2 text-sm">
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      <span>{purposeOptions.find(p => p.value === computer.purpose)?.label || computer.purpose}</span>
                    </div>
                  )}
                  
                  {computer.ipAddress && (
                    <div className="flex items-center gap-2 text-sm">
                      <Wifi className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono">{computer.ipAddress}</span>
                    </div>
                  )}

                  {Object.keys(components).length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => toggleExpand(computer.id)}
                      >
                        <span className="text-sm">Комплектующие</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                      
                      {isExpanded && (
                        <div className="space-y-2 pt-2 border-t dark:border-border/50">
                          {Object.entries(components).map(([key, value]) => (
                            value && (
                              <div key={key} className="flex items-center gap-2 text-sm">
                                <ComponentIcon type={key} />
                                <span className="text-muted-foreground capitalize">{key}:</span>
                                <span className="font-medium">{String(value)}</span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => setSelectedComputer(computer)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Изменить
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => deleteMutation.mutate(computer.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
