import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, X, Image, FileImage, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PhotoUploadProps {
  equipmentId?: number;
  existingPhotos?: string[];
  onPhotosChange?: (photos: string[]) => void;
  disabled?: boolean;
}

interface FileUploadResponse {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export function PhotoUpload({ 
  equipmentId,
  existingPhotos = [], 
  onPhotosChange,
  disabled = false 
}: PhotoUploadProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File): Promise<FileUploadResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'equipment');
      if (equipmentId) {
        formData.append('equipmentId', equipmentId.toString());
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Ошибка загрузки файла');
      }

      return response.json();
    },
    onSuccess: (data) => {
      const newPhotos = [...photos, data.filePath];
      setPhotos(newPhotos);
      onPhotosChange?.(newPhotos);
      setUploading(prev => prev.filter(name => name !== data.fileName));
      toast({
        title: "Успешно",
        description: "Фото загружено",
      });
    },
    onError: (error: any, file: File) => {
      setUploading(prev => prev.filter(name => name !== file.name));
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось загрузить фото",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || disabled) return;

    Array.from(files).forEach(file => {
      // Проверка типа файла
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Ошибка",
          description: "Можно загружать только изображения",
          variant: "destructive",
        });
        return;
      }

      // Проверка размера файла (10MB максимум)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Ошибка",
          description: "Размер файла не должен превышать 10MB",
          variant: "destructive",
        });
        return;
      }

      setUploading(prev => [...prev, file.name]);
      uploadMutation.mutate(file);
    });
  }, [disabled, uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removePhoto = (photoPath: string) => {
    const newPhotos = photos.filter(photo => photo !== photoPath);
    setPhotos(newPhotos);
    onPhotosChange?.(newPhotos);
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  return (
    <div className="space-y-4">
      <Label>Фотографии оборудования</Label>
      
      {/* Drag & Drop зона */}
      <Card 
        className={`border-2 border-dashed transition-colors ${
          dragOver 
            ? 'border-blue-400 bg-blue-50' 
            : disabled 
              ? 'border-gray-200 bg-gray-50' 
              : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <CardContent
          className="flex flex-col items-center justify-center py-8 px-4"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="text-center">
            <Upload className={`mx-auto h-12 w-12 mb-4 ${
              disabled ? 'text-gray-400' : 'text-gray-500'
            }`} />
            <div className="space-y-2">
              <p className={`text-sm font-medium ${
                disabled ? 'text-gray-400' : 'text-gray-700'
              }`}>
                {dragOver 
                  ? 'Отпустите файлы для загрузки' 
                  : 'Перетащите фото сюда или нажмите для выбора'}
              </p>
              <p className="text-xs text-gray-500">
                Поддерживаются JPG, PNG, GIF до 10MB
              </p>
            </div>
            
            <Input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              id="photo-upload"
              onChange={(e) => handleFileSelect(e.target.files)}
              disabled={disabled}
            />
            <Label htmlFor="photo-upload" asChild>
              <Button 
                variant="outline" 
                className="mt-4"
                disabled={disabled}
              >
                <FileImage className="w-4 h-4 mr-2" />
                Выбрать файлы
              </Button>
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Загружаемые файлы */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-gray-600">Загружается...</Label>
          {uploading.map((fileName) => (
            <div key={fileName} className="flex items-center space-x-2 p-2 bg-blue-50 rounded-lg">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm text-blue-800">{fileName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Загруженные фото */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm text-gray-600">
            Загруженные фото ({photos.length})
          </Label>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo, index) => (
              <div key={index} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border">
                  <img
                    src={photo}
                    alt={`Equipment photo ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Если изображение не загрузилось, показываем заглушку
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                  <div className="hidden w-full h-full flex items-center justify-center bg-gray-100">
                    <div className="text-center">
                      <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">Ошибка загрузки</p>
                    </div>
                  </div>
                </div>
                
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
                    onClick={() => removePhoto(photo)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
                
                <Badge 
                  variant="secondary" 
                  className="absolute bottom-1 left-1 text-xs bg-black/50 text-white border-0"
                >
                  {getFileName(photo)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Информация о лимитах */}
      <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
        <div className="flex items-start space-x-2">
          <Image className="w-4 h-4 mt-0.5 text-gray-400" />
          <div>
            <p className="font-medium mb-1">Рекомендации по фото:</p>
            <ul className="space-y-1">
              <li>• Делайте четкие фото с хорошим освещением</li>
              <li>• Фотографируйте серийные номера, повреждения, особенности</li>
              <li>• Размер файла до 10MB, форматы: JPG, PNG, GIF</li>
              <li>• Можно загружать несколько фото одновременно</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}