import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Package, MapPin, AlertCircle, CheckCircle, ArrowRight, ArrowLeft, RefreshCw, Edit } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { canEditEquipment, canReserveEquipment } from "@/lib/equipment-permissions";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Equipment } from "@shared/schema";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onEquipmentFound?: (equipment: Equipment) => void;
  onBarcodeScanned?: (barcode: string) => void;
  companyManager?: boolean;
  canRequestCheckout?: boolean;
}

type PermissionState = "prompt" | "granted" | "denied" | "checking";

function getCurrentUser() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('streamstudio_user') || '{}');
  } catch {
    return {};
  }
}

export function BarcodeScanner({
  isOpen,
  onClose,
  onEquipmentFound,
  onBarcodeScanned,
  companyManager = false,
  canRequestCheckout = false,
}: BarcodeScannerProps) {
  const [permissionState, setPermissionState] = useState<PermissionState>("prompt");
  const [scanning, setScanning] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const permissionCleanupRef = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<any>({});
  
  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const canEdit = canEditEquipment(currentUser) || companyManager;
  const canReserve = canReserveEquipment(currentUser) || companyManager;

  const { data: equipment, isLoading, isError } = useQuery<Equipment>({
    queryKey: ["/api/equipment/barcode", scannedCode],
    queryFn: async () => {
      if (!scannedCode) throw new Error("barcode is empty");
      const response = await fetch(apiUrl(`/api/equipment/barcode/${encodeURIComponent(scannedCode)}`), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Equipment not found with this barcode");
      return response.json();
    },
    enabled: !!scannedCode,
  });

  const { data: users = [] } = useQuery<Array<{ id: string; name?: string | null; username?: string | null }>>({
    queryKey: ["/api/users"],
  });

  const getAssignedUserName = (assignedTo: string | null | undefined) => {
    const normalized = String(assignedTo ?? "").trim();
    if (!normalized) return "";

    const matchedUser = users.find((user) => {
      const candidates = [user.id, user.name, user.username]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      return candidates.includes(normalized);
    });

    return matchedUser?.name?.trim() || matchedUser?.username?.trim() || normalized;
  };

  const updateEquipmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Equipment> }) => {
      const response = await apiRequest("PUT", `/api/equipment/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment/barcode", scannedCode] });
      toast({ title: "Успешно", description: "Статус оборудования обновлён" });
    },
    onError: () => {
      toast({ title: "Ошибка", description: "Не удалось обновить статус", variant: "destructive" });
    },
  });

  const checkCameraPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      setError("Ваш браузер не поддерживает доступ к камере");
      setPermissionState("denied");
      return;
    }

    try {
      if (permissionCleanupRef.current) {
        permissionCleanupRef.current();
        permissionCleanupRef.current = null;
      }

      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          
          if (permissionStatus.state === 'granted') {
            setPermissionState("granted");
            return;
          } else if (permissionStatus.state === 'denied') {
            setPermissionState("denied");
            setError("Доступ к камере запрещён. Разрешите доступ в настройках браузера.");
            return;
          }
          
          const handleChange = () => {
            if (permissionStatus.state === 'granted') {
              setPermissionState("granted");
              setError(null);
            } else if (permissionStatus.state === 'denied') {
              setPermissionState("denied");
              setError("Доступ к камере запрещён. Разрешите доступ в настройках браузера.");
            }
          };
          
          permissionStatus.addEventListener('change', handleChange);
          permissionCleanupRef.current = () => {
            permissionStatus.removeEventListener('change', handleChange);
          };
          
          setPermissionState("prompt");
        } catch (e) {
          setPermissionState("prompt");
        }
      } else {
        setPermissionState("prompt");
      }
    } catch (err) {
      setPermissionState("prompt");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      checkCameraPermission();
    }
    return () => {
      stopScanning();
      if (permissionCleanupRef.current) {
        permissionCleanupRef.current();
        permissionCleanupRef.current = null;
      }
    };
  }, [isOpen, checkCameraPermission]);

  useEffect(() => {
    if (isOpen && permissionState === "granted" && !scanning && !scannedCode && !error) {
      startScanning();
    }
  }, [isOpen, permissionState, scanning, scannedCode, error]);

  const requestCameraPermission = async () => {
    try {
      setError(null);
      setPermissionState("checking");
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      
      stream.getTracks().forEach(track => track.stop());
      
      setPermissionState("granted");
    } catch (err: any) {
      console.error("Permission request error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState("denied");
        setError("Доступ к камере запрещён. Разрешите доступ в настройках браузера.");
      } else if (err.name === 'NotFoundError') {
        setPermissionState("denied");
        setError("Камера не найдена на устройстве.");
      } else {
        setError("Не удалось получить доступ к камере: " + err.message);
        setPermissionState("prompt");
      }
    }
  };

  const startScanning = async () => {
    try {
      setError(null);
      setScannedCode(null);
      
      if (!containerRef.current) return;
      
      const html5QrCode = new Html5Qrcode("barcode-reader");
      scannerRef.current = html5QrCode;
      
      const videoConstraints: MediaTrackConstraints = {
        facingMode: "environment",
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
      };
      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 15,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.777778,
          disableFlip: false,
          videoConstraints,
        },
        (decodedText) => {
          setScannedCode(decodedText);
          stopScanning();
        },
        () => {}
      );
      
      setScanning(true);
    } catch (err: any) {
      console.error("Error starting scanner:", err);
      if (err.name === 'NotAllowedError') {
        setPermissionState("denied");
        setError("Доступ к камере запрещён. Разрешите доступ в настройках браузера.");
      } else {
        setError("Не удалось запустить сканер: " + (err.message || "Неизвестная ошибка"));
      }
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleClose = () => {
    stopScanning();
    setScannedCode(null);
    setError(null);
    setPermissionState("prompt");
    onClose();
  };

  const handleRescan = () => {
    setScannedCode(null);
    setError(null);
    if (permissionState === "granted") {
      startScanning();
    } else {
      requestCameraPermission();
    }
  };

  const handleTakeEquipment = () => {
    if (equipment) {
      updateEquipmentMutation.mutate({
        id: equipment.id,
        data: { 
          status: "in-use",
          assignedTo: currentUser.id || currentUser.name,
        }
      });
    }
  };

  const handleReturnEquipment = () => {
    if (equipment) {
      updateEquipmentMutation.mutate({
        id: equipment.id,
        data: { 
          status: "available",
          assignedTo: null,
        }
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available": return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
      case "in-use": return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
      case "maintenance": return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
      case "broken": return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
      default: return "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available": return "Доступно";
      case "in-use": return "Используется";
      case "maintenance": return "Обслуживание";
      case "broken": return "Сломано";
      default: return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-white dark:bg-slate-900">
        <DialogHeader className="p-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-white">
            <Camera className="w-5 h-5" />
            Сканер штрих-кода
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400">
            Наведите камеру на штрих-код оборудования
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4">
          {/* Permission Request State */}
          {(permissionState === "prompt" || permissionState === "checking") && !scannedCode && !error && (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Camera className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                  Разрешите доступ к камере
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Для сканирования штрих-кодов требуется доступ к камере вашего устройства
                </p>
              </div>
              <Button 
                onClick={requestCameraPermission}
                className="w-full"
                disabled={permissionState === "checking"}
                data-testid="button-request-camera"
              >
                {permissionState === "checking" ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 mr-2" />
                )}
                {permissionState === "checking" ? "Проверка..." : "Разрешить камеру"}
              </Button>
            </div>
          )}

          {/* Permission Denied State */}
          {permissionState === "denied" && !scannedCode && (
            <div className="text-center py-8 space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                <AlertCircle className="w-10 h-10 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                  Доступ к камере запрещён
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {error || "Разрешите доступ к камере в настройках браузера и попробуйте снова"}
                </p>
              </div>
              <Button 
                variant="outline"
                onClick={requestCameraPermission}
                className="w-full"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Попробовать снова
              </Button>
            </div>
          )}

          {/* Scanner View */}
          {permissionState === "granted" && !scannedCode && !error && (
            <div className="space-y-4">
              <div 
                id="barcode-reader" 
                ref={containerRef}
                className="barcode-scanner-view w-full rounded-xl overflow-hidden bg-black border-2 border-slate-200 dark:border-slate-700 [&_video]:object-cover [&_video]:min-h-[280px] [&_img]:object-cover"
                style={{ minHeight: "280px" }}
              />
              {scanning && (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Сканирование...
                </div>
              )}
            </div>
          )}

          {/* Error State (non-permission) */}
          {error && permissionState !== "denied" && (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button onClick={handleRescan}>
                Попробовать снова
              </Button>
            </div>
          )}

          {/* Result View */}
          {scannedCode && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-mono text-sm text-emerald-800 dark:text-emerald-300 break-all">{scannedCode}</span>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              {isError && (
                <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                  <CardContent className="py-6 text-center">
                    <Package className="w-12 h-12 mx-auto mb-4 text-amber-400" />
                    <p className="font-medium text-amber-800 dark:text-amber-300 mb-2">
                      Оборудование не найдено
                    </p>
                    <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
                      Штрих-код не зарегистрирован в системе
                    </p>
                    {onBarcodeScanned && (
                      <Button 
                        variant="outline"
                        onClick={() => {
                          onBarcodeScanned(scannedCode!);
                          handleClose();
                        }}
                        className="w-full"
                        data-testid="button-search-barcode"
                      >
                        Искать в инвентаре
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {equipment && (
                <Card className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300" data-testid="scanned-equipment-result">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{equipment.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{equipment.model}</p>
                      </div>
                      <Badge className={getStatusColor(equipment.status)}>
                        {getStatusText(equipment.status)}
                      </Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      {equipment.serialNumber && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400">Серийный номер:</span>
                          <span className="font-medium">{equipment.serialNumber}</span>
                        </div>
                      )}
                      {equipment.inventoryNumber && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400">Инв. номер:</span>
                          <span className="font-medium">{equipment.inventoryNumber}</span>
                        </div>
                      )}
                      {equipment.location && (
                        <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          <span className="text-slate-500 dark:text-slate-400">Место:</span>
                          <span className="font-medium ml-1">{equipment.location}</span>
                        </div>
                      )}
                      {equipment.assignedTo && (
                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400">Забрал:</span>
                          <span className="font-medium">{getAssignedUserName(equipment.assignedTo)}</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {(canReserve || canEdit) && (
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        {canReserve && equipment.status === "available" ? (
                          <Button 
                            className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={handleTakeEquipment}
                            disabled={updateEquipmentMutation.isPending}
                            data-testid="button-take-equipment"
                          >
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Взять
                          </Button>
                        ) : canReserve && equipment.status === "in-use" ? (
                          <>
                            <Button 
                              variant="outline"
                              onClick={handleReturnEquipment}
                              disabled={updateEquipmentMutation.isPending}
                              data-testid="button-return-equipment"
                            >
                              <ArrowLeft className="w-4 h-4 mr-2" />
                              Вернуть
                            </Button>
                            <Button 
                              variant="outline"
                              onClick={() => {
                                if (onEquipmentFound) {
                                  onEquipmentFound(equipment);
                                  handleClose();
                                }
                              }}
                              data-testid="button-transfer-equipment"
                            >
                              <ArrowRight className="w-4 h-4 mr-2" />
                              Передать
                            </Button>
                          </>
                        ) : null}
                        
                        {canEdit && (
                        <Button 
                          variant="ghost"
                          className="col-span-2 text-slate-600 dark:text-slate-400"
                          onClick={() => {
                            if (onEquipmentFound) {
                              onEquipmentFound(equipment);
                              handleClose();
                            }
                          }}
                          data-testid="button-edit-equipment"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Редактировать
                        </Button>
                        )}
                      </div>
                    )}

                    {!canReserve && !canEdit && onEquipmentFound && (
                      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            onEquipmentFound(equipment);
                            handleClose();
                          }}
                        >
                          {canRequestCheckout && equipment.status === "available" ? "Запросить выдачу" : "Открыть карточку"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleRescan}
                data-testid="button-scan-again"
              >
                <Camera className="w-4 h-4 mr-2" />
                Сканировать ещё
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

