# Настройка удаленного Whisper X API

## Требования

1. Установленный Whisper X на удаленном компьютере
2. Настроенный API сервер для Whisper X
3. Доступ к удаленному серверу по сети

## Настройка переменных окружения

Добавьте в `.env` файл (или переменные окружения сервера):

```env
# URL удаленного Whisper X API
WHISPER_X_API_URL=http://192.168.1.100:8000

# Опционально: API ключ для аутентификации (если требуется)
WHISPER_X_API_KEY=your_api_key_here

# Таймаут для запросов транскрибации (в миллисекундах, по умолчанию 5 минут)
WHISPER_X_TIMEOUT=300000
```

## Формат API Whisper X

API должен поддерживать следующий формат:

### Endpoint: `POST /transcribe`

**Request:**
- `Content-Type: multipart/form-data`
- `file`: файл (аудио или видео)
- `language` (опционально): код языка (например, "ru", "en")
- `task` (опционально): "transcribe" или "translate"
- `return_timestamps` (опционально): "true" или "false"
- `diarize` (опционально): "true" или "false" - включить диаризацию спикеров
- `num_speakers` (опционально): количество спикеров (число, например "2")

**Response:**
```json
{
  "text": "Полный текст транскрипции",
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "text": "Текст сегмента",
      "speaker": "SPEAKER_00"
    }
  ],
  "language": "ru",
  "speakers": ["SPEAKER_00", "SPEAKER_01"]
}
```

**Важно:** Если включена диаризация (`diarize=true`), каждый сегмент должен содержать поле `speaker` с ID спикера (например, "SPEAKER_00", "SPEAKER_01").

### Endpoint: `GET /health` (опционально)

Проверка доступности API. Должен возвращать статус 200 OK.

## Пример настройки Whisper X API сервера

Если у вас установлен Whisper X с Pyannote, вы можете создать простой FastAPI сервер:

```python
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
import whisperx
import tempfile
import os

app = FastAPI()

# Загрузка моделей при старте
model = whisperx.load_model("large-v2", device="cuda", compute_type="float16")
# Загрузка модели диаризации (Pyannote)
diarize_model = whisperx.DiarizationPipeline(use_auth_token="YOUR_HF_TOKEN", device="cuda")

@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form(None),
    task: str = Form("transcribe"),
    return_timestamps: bool = Form(False),
    diarize: bool = Form(False),
    num_speakers: int = Form(None)
):
    # Сохраняем файл во временную директорию
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_file:
        content = await file.read()
        tmp_file.write(content)
        tmp_file_path = tmp_file.name
    
    try:
        # Транскрибируем
        audio = whisperx.load_audio(tmp_file_path)
        result = model.transcribe(audio, language=language, task=task)
        
        # Диаризация спикеров (если включена)
        if diarize:
            diarize_segments = diarize_model(
                tmp_file_path,
                min_speakers=num_speakers if num_speakers else None,
                max_speakers=num_speakers if num_speakers else None
            )
            # Синхронизируем транскрипцию с диаризацией
            result = whisperx.assign_word_speakers(diarize_segments, result)
        
        # Формируем ответ
        response = {
            "text": " ".join([seg["text"] for seg in result["segments"]]),
            "language": result.get("language", language or "auto")
        }
        
        if return_timestamps:
            response["segments"] = [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"],
                    "speaker": seg.get("speaker")  # Добавляем ID спикера если есть
                }
                for seg in result["segments"]
            ]
        
        # Список уникальных спикеров
        if diarize:
            speakers = list(set([seg.get("speaker") for seg in result["segments"] if seg.get("speaker")]))
            response["speakers"] = speakers
        
        return JSONResponse(content=response)
    finally:
        # Удаляем временный файл
        os.unlink(tmp_file_path)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

Запуск:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Установка зависимостей на сервере StreamDesk

Установите необходимые пакеты:

```bash
npm install docx pdfkit form-data node-fetch@2
```

## Использование

После настройки вы можете использовать транскрибацию через UI или API:

### API Endpoint: `POST /api/transcriptions/transcribe`

**Request:**
- `file`: файл (аудио или видео)
- `format`: "txt", "doc", "pdf" (по умолчанию "txt")
- `language`: код языка (по умолчанию "ru")

**Response:**
```json
{
  "success": true,
  "transcription": "Полный текст транскрипции",
  "segments": [...],
  "language": "ru",
  "format": "pdf",
  "file": {
    "url": "/uploads/transcriptions/output/audio-1234567890.pdf",
    "name": "audio-transcription.pdf",
    "size": 12345,
    "mimeType": "application/pdf"
  }
}
```

