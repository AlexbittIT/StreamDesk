f# Перенос StreamDesk на сервер (со старой БД)

1. Склонировать проект с Git:
   ```bash
   git clone <repo-url>
   cd StreamDesk
   ```

2. Вручную скопировать на сервер (их НЕТ в Git — лежат в `.gitignore`, т.к. реальные данные):
   - `db-init/` — дамп старой БД (грузится автоматически при первом старте)
   - `uploads-seed/` — старые файлы (аватары, фото чата)

3. Запустить:
   ```bash
   docker compose up -d --build
   ```

4. Залить старые файлы в контейнер:
   ```bash
   docker compose cp ./uploads-seed/. app:/app/uploads/
   ```

Готово → http://<сервер>:5050

---
**Важно:** дамп из `db-init/` выполняется только при ПУСТОМ volume (первый запуск).
Перезалить с нуля: `docker compose down -v && docker compose up -d --build` (стирает текущие данные!).
