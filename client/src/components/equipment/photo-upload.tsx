import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiUrl } from '@/lib/queryClient';

interface PhotoUploadProps {
  equipmentId?: string;
  existingPhotos: string[];
  onPhotosChange: (photos: string[]) => void;
}

export function PhotoUpload({ equipmentId, existingPhotos, onPhotosChange }: PhotoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];
      
      for (const file of Array.from(files)) {
        // Простая симуляция загрузки файла
        // В реальном приложении здесь должна быть загрузка на сервер или в облако
        const formData = new FormData();
        formData.append('photo', file);
        const response = await fetch(apiUrl('/api/equipment/photos/upload'), {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        if (!response.ok) throw new Error('Upload failed');
        const data = await response.json();
        if (typeof data?.url !== 'string' || !data.url) throw new Error('Invalid upload response');
        uploadedUrls.push(data.url);
      }

      const updatedPhotos = [...existingPhotos.filter((photo) => !String(photo).startsWith('blob:')), ...uploadedUrls];
      onPhotosChange(updatedPhotos);
      
      toast({
        title: "Успешно",
        description: `Загружено ${uploadedUrls.length} фото`,
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить фото",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const addPhotoByUrl = () => {
    if (!newPhotoUrl.trim()) return;
    if (newPhotoUrl.trim().startsWith('blob:')) {
      toast({
        title: "Ошибка",
        description: "Blob-ссылки не сохраняются. Загрузите файл кнопкой ниже.",
        variant: "destructive",
      });
      return;
    }
    
    // Простая проверка на URL изображения
    if (!newPhotoUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) && !newPhotoUrl.startsWith('http')) {
      toast({
        title: "Ошибка",
        description: "Введите корректную ссылку на изображение",
        variant: "destructive",
      });
      return;
    }

    const updatedPhotos = [...existingPhotos.filter((photo) => !String(photo).startsWith('blob:')), newPhotoUrl];
    onPhotosChange(updatedPhotos);
    setNewPhotoUrl('');
    
    toast({
      title: "Успешно",
      description: "Фото добавлено",
    });
  };

  const removePhoto = (index: number) => {
    const updatedPhotos = existingPhotos.filter((_, i) => i !== index);
    onPhotosChange(updatedPhotos);
  };

  const visiblePhotos = existingPhotos.filter((photo) => !String(photo).startsWith('blob:'));
  const brokenLocalPhotos = existingPhotos.length - visiblePhotos.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Фотографии оборудования
        </label>
        <span className="text-xs text-gray-500">
          {existingPhotos.length} фото
        </span>
      </div>

      {/* Существующие фотографии */}
      {brokenLocalPhotos > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Старые временные фото не открываются после перезагрузки. Загрузите файлы заново.
        </div>
      )}

      {visiblePhotos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {visiblePhotos.map((photo, index) => (
            <div key={index} className="relative group">
              <img
                src={/^(https?:)?\/\//i.test(photo) || photo.startsWith("/") ? photo : photo.includes("uploads/") ? `/${photo.replace(/^\/+/, "")}` : `/uploads/${photo.replace(/^\/+/, "")}`}
                alt={`Фото ${index + 1}`}
                className="w-full h-24 object-cover rounded-lg border"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-image.png';
                }}
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-1 right-1 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePhoto(index)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Загрузка файлов */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
        <div className="text-center space-y-4">
          <Upload className="w-8 h-8 mx-auto text-gray-400" />
          <div>
            <label htmlFor="photo-upload" className="cursor-pointer">
              <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
                Загрузить файлы
              </span>
              <input
                id="photo-upload"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">
              PNG, JPG, GIF до 10MB
            </p>
          </div>
        </div>
      </div>

      {/* Добавление по URL */}
      <div className="flex gap-2">
        <Input
          placeholder="Или введите ссылку на изображение"
          value={newPhotoUrl}
          onChange={(e) => setNewPhotoUrl(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && addPhotoByUrl()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addPhotoByUrl}
          disabled={!newPhotoUrl.trim()}
        >
          Добавить
        </Button>
      </div>

      {isUploading && (
        <div className="text-center">
          <div className="inline-flex items-center px-4 py-2 text-sm text-blue-600">
            <Upload className="w-4 h-4 mr-2 animate-pulse" />
            Загрузка фотографий...
          </div>
        </div>
      )}
    </div>
  );
}
