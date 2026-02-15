import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Zone {
  id: string;
  name: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  color?: string;
}

interface AddZoneDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (zone: Omit<Zone, "id">) => void;
}

export function AddZoneDialog({ open, onClose, onAdd }: AddZoneDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(200);
  const [color, setColor] = useState("#3b82f6");

  const handleAdd = () => {
    if (!name.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название зоны",
        variant: "destructive",
      });
      return;
    }

    onAdd({
      name: name.trim(),
      position: { x: 50, y: 50 },
      width,
      height,
      color,
    });

    setName("");
    setWidth(300);
    setHeight(200);
    setColor("#3b82f6");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать зону</DialogTitle>
          <DialogDescription>
            Создайте зону для группировки устройств на схеме
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Название зоны *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Студия А"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ширина (px)</Label>
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                min={100}
                max={2000}
              />
            </div>
            <div>
              <Label>Высота (px)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                min={100}
                max={2000}
              />
            </div>
          </div>
          <div>
            <Label>Цвет</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-20 h-10"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#3b82f6"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleAdd}>
              Создать
            </Button>
            <Button variant="outline" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

