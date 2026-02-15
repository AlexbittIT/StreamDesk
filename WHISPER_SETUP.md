# Настройка whisper.cpp для транскрипции аудио

Для работы транскрипции аудио файлов в ChatGPT необходимо установить и настроить whisper.cpp.

## Установка whisper.cpp

### Windows

1. Скачайте whisper.cpp с GitHub:
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp
   ```

2. Скомпилируйте проект:
   - Используйте Visual Studio или MinGW
   - Или используйте предкомпилированные бинарники из релизов

3. Скачайте модель:
   - Перейдите в папку `models`
   - Скачайте модель (рекомендуется `ggml-base.bin` или `ggml-small.bin`)
   - Пример: `ggml-base.bin` для баланса между качеством и скоростью

### Linux/Mac

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp
   ```

2. Скомпилируйте:
   ```bash
   make
   ```

3. Скачайте модель:
   ```bash
   bash ./models/download-ggml-model.sh base
   ```

## Настройка переменных окружения

Добавьте в файл `.env`:

```env
# Путь к исполняемому файлу whisper.cpp
WHISPER_CPP_PATH=./whisper.cpp

# Путь к модели whisper
WHISPER_MODEL_PATH=./whisper.cpp/models/ggml-base.bin
```

**Важно:** 
- На Windows используйте `WHISPER_CPP_PATH=./whisper.cpp` (исполняемый файл будет `main.exe`)
- На Linux/Mac используйте `WHISPER_CPP_PATH=./whisper.cpp` (исполняемый файл будет `main`)

## Использование

После настройки, при загрузке аудио файлов в ChatGPT они будут автоматически транскрибироваться через whisper.cpp.

Поддерживаемые форматы аудио:
- WAV
- MP3
- M4A
- FLAC
- OGG
- И другие форматы, поддерживаемые whisper.cpp

## Примечания

- Транскрипция выполняется на русском языке по умолчанию
- Если whisper.cpp не установлен, загрузка файлов всё равно будет работать, но без транскрипции
- Для больших файлов транскрипция может занять некоторое время

