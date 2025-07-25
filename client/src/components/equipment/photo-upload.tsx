import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
        const url = URL.createObjectURL(file);
        uploadedUrls.push(url);
      }

      const updatedPhotos = [...existingPhotos, ...uploadedUrls];
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
    
    // Простая проверка на URL изображения
    if (!newPhotoUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) && !newPhotoUrl.startsWith('http')) {
      toast({
        title: "Ошибка",
        description: "Введите корректную ссылку на изображение",
        variant: "destructive",
      });
      return;
    }

    const updatedPhotos = [...existingPhotos, newPhotoUrl];
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
      {existingPhotos.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {existingPhotos.map((photo, index) => (
            <div key={index} className="relative group">
              <img
                src={photo}
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