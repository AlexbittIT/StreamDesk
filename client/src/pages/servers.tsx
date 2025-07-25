import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Server, Globe, Trash2, CheckCircle, XCircle, Clock } from "lucide-react";
import { insertObsConnectionSchema } from "../../../shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

type ObsConnection = {
  id: number;
  name: string;
  host: string;
  port: number;
  password: string;
  status: string;
  streamStatus: string;
  createdAt: string;
};

const obsFormSchema = insertObsConnectionSchema.extend({
  password: z.string().min(1, "Пароль обязателен")
});

export default function Servers() {
  const { toast } = useToast();

  const { data: servers = [], isLoading } = useQuery<ObsConnection[]>({
    queryKey: ["/api/obs-connections"]
  });

  const createMutation = useMutation({
    mutationFn: (data: z.infer<typeof obsFormSchema>) =>
      apiRequest("/api/obs-connections", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs-connections"] });
      toast({
        title: "Успешно",
        description: "OBS подключение создано",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/obs-connections/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/obs-connections"] });
      toast({
        title: "Успешно",
        description: "OBS подключение удалено",
      });
    },
  });

  const form = useForm<z.infer<typeof obsFormSchema>>({
    resolver: zodResolver(obsFormSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 4455,
      password: "",
      status: "disconnected",
      streamStatus: "stopped"
    },
  });

  const onSubmit = (data: z.infer<typeof obsFormSchema>) => {
    createMutation.mutate(data);
    form.reset();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-green-100 text-green-800 border-green-200";
      case "disconnected":
        return "bg-red-100 text-red-800 border-red-200";
      case "connecting":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle className="w-4 h-4" />;
      case "disconnected":
        return <XCircle className="w-4 h-4" />;
      case "connecting":
        return <Clock className="w-4 h-4" />;
      default:
        return <XCircle className="w-4 h-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Управление серверами</h2>
          <p className="text-gray-600">Управление OBS подключениями и серверами</p>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Управление серверами</h2>
          <p className="text-gray-600">Управление OBS подключениями и серверами</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Добавить OBS
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Добавить OBS подключение</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Название</FormLabel>
                      <FormControl>
                        <Input placeholder="OBS Studio - Главный" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="host"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IP адрес</FormLabel>
                      <FormControl>
                        <Input placeholder="192.168.1.100" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="port"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Порт</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="4455" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пароль</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="obs-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Добавление..." : "Добавить"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {servers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Server className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Нет подключений</h3>
              <p className="text-gray-600 text-center mb-4">
                Добавьте первое OBS подключение для начала работы
              </p>
            </CardContent>
          </Card>
        ) : (
          servers.map((server) => (
            <Card key={server.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Server className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{server.name}</CardTitle>
                      <div className="flex items-center space-x-2 mt-1">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{server.host}:{server.port}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(server.status)}>
                      {getStatusIcon(server.status)}
                      <span className="ml-1">
                        {server.status === "connected" ? "Подключен" : 
                         server.status === "connecting" ? "Подключение" : "Отключен"}
                      </span>
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(server.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-gray-500">Статус подключения</Label>
                    <p className="font-medium">
                      {server.status === "connected" ? "Подключен" : 
                       server.status === "connecting" ? "Подключение..." : "Отключен"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-500">Статус стрима</Label>
                    <p className="font-medium">
                      {server.streamStatus === "streaming" ? "Идет стрим" : 
                       server.streamStatus === "starting" ? "Запуск..." : "Остановлен"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}