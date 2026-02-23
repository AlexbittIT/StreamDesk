import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Map, Building2, Layers, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAPS_BASE = "https://raw.githubusercontent.com/one-zero-eight/maps/main/static";

const FLOOR_TABS = [
  { id: "floor-1", label: "Этаж 1", src: `${MAPS_BASE}/university-floor-1.svg` },
  { id: "floor-2", label: "Этаж 2", src: `${MAPS_BASE}/university-floor-2.svg` },
  { id: "floor-3", label: "Этаж 3", src: `${MAPS_BASE}/university-floor-3.svg` },
  { id: "floor-4", label: "Этаж 4", src: `${MAPS_BASE}/university-floor-4.svg` },
  { id: "floor-5", label: "Этаж 5", src: `${MAPS_BASE}/university-floor-5.svg` },
  { id: "floor-0", label: "Этаж -1", src: `${MAPS_BASE}/university-floor-0.svg` },
  { id: "sport", label: "Спорткомплекс", src: `${MAPS_BASE}/sport-complex.svg` },
  { id: "campus", label: "Кампус", src: `${MAPS_BASE}/campus.svg` },
];

export default function MapsPage() {
  const [activeFloor, setActiveFloor] = useState(FLOOR_TABS[0].id);
  const [fullscreen, setFullscreen] = useState(false);
  const [imgError, setImgError] = useState(false);

  const currentMap = FLOOR_TABS.find((t) => t.id === activeFloor);

  const handleFloorChange = (id: string) => {
    setActiveFloor(id);
    setImgError(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Карты
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Переключение этажей. Просто смотрим схемы без зума и перемещения.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-0.5 rounded-xl bg-muted/20 w-full min-w-0">
          {FLOOR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleFloorChange(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap",
                activeFloor === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tab.id.startsWith("floor") ? (
                <Layers className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Building2 className="h-3.5 w-3.5 shrink-0" />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        <Card className={cn(
          "bg-card border-border overflow-hidden rounded-xl",
          fullscreen && "fixed inset-4 z-50 rounded-2xl"
        )}>
          <CardContent className="p-0 relative">
            <div
              className="relative w-full min-h-[280px] sm:min-h-[360px] md:min-h-[420px] bg-muted/10 dark:bg-white/95 overflow-hidden flex items-center justify-center select-none"
            >
              {currentMap ? (
                imgError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-muted/30 text-center">
                    <Map className="h-12 w-12 text-primary/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Карта недоступна (проверьте интернет)</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">{currentMap.label}</p>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center origin-center will-change-transform"
                    style={{
                      minWidth: "100%",
                      minHeight: "100%",
                      width: "max(100%, 800px)",
                      height: "max(100%, 600px)",
                    }}
                  >
                    <object
                      data={currentMap.src}
                      type="image/svg+xml"
                      aria-label={currentMap.label}
                      className="block w-full h-full max-w-none pointer-events-none select-none"
                      style={{ objectFit: "contain", minWidth: "100%", minHeight: "100%" }}
                      onError={() => setImgError(true)}
                    >
                      <img
                        src={currentMap.src}
                        alt={currentMap.label}
                        className="block w-full h-full object-contain pointer-events-none"
                        onError={() => setImgError(true)}
                        draggable={false}
                      />
                    </object>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center">
                  <Map className="h-12 w-12 text-primary/50 mb-2" />
                  <p className="text-sm text-muted-foreground">Выберите этаж или здание</p>
                </div>
              )}
              {currentMap && !imgError && (
                <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setFullscreen(!fullscreen)}
                    className="p-2 rounded-lg bg-card/90 border border-border hover:bg-muted transition-colors shadow-sm"
                    title={fullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
                  >
                    <Maximize2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
