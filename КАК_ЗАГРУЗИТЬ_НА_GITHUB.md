# 📤 КАК ЗАГРУЗИТЬ ПРОЕКТ STREAMDESK НА GITHUB

## 📋 ШАГ 1: ПОДГОТОВКА ПРОЕКТА

### 1.1. Проверка наличия Git

Откройте PowerShell или Git Bash в папке проекта и проверьте:

```bash
git --version
```

Если Git не установлен, скачайте с: https://git-scm.com/download/win

### 1.2. Инициализация Git репозитория (если еще не инициализирован)

```bash
cd D:\StreamDesk
git init
```

### 1.3. Создание .gitignore файла

Убедитесь, что у вас есть файл `.gitignore` в корне проекта. Если его нет, создайте:

```bash
# В PowerShell или Git Bash
notepad .gitignore
```

Вставьте следующее содержимое:

```
# Зависимости
node_modules/
client/node_modules/
.pnp
.pnp.js

# Сборка
dist/
build/
client/dist/
client/build/
*.tsbuildinfo

# Переменные окружения
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Логи
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
*.log

# Временные файлы
.DS_Store
*.swp
*.swo
*~
.idea/
.vscode/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Загрузки
uploads/
!uploads/.gitkeep

# База данных
*.db
*.sqlite
*.sqlite3

# PM2
.pm2/
ecosystem.config.js.bak

# SSL сертификаты
*.key
*.crt
*.pem
*.cert

# Резервные копии
*.bak
*.backup
*.old

# Системные файлы
Thumbs.db
desktop.ini
```

Сохраните файл (`Ctrl+S`) и закройте.

---

## 📋 ШАГ 2: СОЗДАНИЕ РЕПОЗИТОРИЯ НА GITHUB

### 2.1. Войдите в GitHub

1. Откройте браузер и перейдите на https://github.com
2. Войдите в свой аккаунт (или создайте новый, если его нет)

### 2.2. Создайте новый репозиторий

1. Нажмите на **"+"** в правом верхнем углу
2. Выберите **"New repository"**
3. Заполните форму:
   - **Repository name:** `StreamDesk` (или любое другое имя)
   - **Description:** `StreamDesk - Система управления стримингом и оборудованием`
   - **Visibility:** Выберите **Public** (публичный) или **Private** (приватный)
   - **НЕ** ставьте галочки на "Add a README file", "Add .gitignore", "Choose a license" (у нас уже есть файлы)
4. Нажмите **"Create repository"**

### 2.3. Скопируйте URL репозитория

После создания репозитория GitHub покажет страницу с инструкциями. Скопируйте URL репозитория.

Он будет выглядеть так:
- **HTTPS:** `https://github.com/ваш-username/StreamDesk.git`
- **SSH:** `git@github.com:ваш-username/StreamDesk.git`

---

## 📋 ШАГ 3: ПЕРВОНАЧАЛЬНАЯ ЗАГРУЗКА ПРОЕКТА

### 3.1. Добавление всех файлов в Git

```bash
# Перейдите в папку проекта
cd D:\StreamDesk

# Добавьте все файлы (кроме тех, что в .gitignore)
git add .
```

### 3.2. Создание первого коммита

```bash
git commit -m "Initial commit: StreamDesk project"
```

**Что такое коммит?**
Коммит - это сохранение изменений в истории Git. Сообщение коммита описывает, что было добавлено.

### 3.3. Переименование ветки (если нужно)

```bash
# Переименование ветки в main (если у вас master)
git branch -M main
```

### 3.4. Подключение к удаленному репозиторию

```bash
# Замените URL на ваш реальный URL репозитория
git remote add origin https://github.com/ваш-username/StreamDesk.git
```

**Если репозиторий уже существует и вы хотите заменить его:**

```bash
# Удалите старый remote
git remote remove origin

# Добавьте новый
git remote add origin https://github.com/ваш-username/StreamDesk.git
```

### 3.5. Загрузка на GitHub

```bash
git push -u origin main
```

**Если используете SSH вместо HTTPS:**

```bash
git remote add origin git@github.com:ваш-username/StreamDesk.git
git push -u origin main
```

**При первом push вас могут попросить авторизоваться:**
- Если используете HTTPS - введите логин и пароль GitHub
- Если используете SSH - убедитесь, что настроены SSH ключи

---

## 📋 ШАГ 4: ПРОВЕРКА ЗАГРУЗКИ

1. Обновите страницу репозитория на GitHub
2. Вы должны увидеть все файлы проекта
3. Проверьте, что файлы `.env`, `node_modules/` и другие исключенные файлы НЕ загружены

---

## 📋 ШАГ 5: ДАЛЬНЕЙШАЯ РАБОТА С GITHUB

### 5.1. Обновление проекта на GitHub

Когда вы вносите изменения в проект:

```bash
# Перейдите в папку проекта
cd D:\StreamDesk

# Проверьте статус изменений
git status

# Добавьте измененные файлы
git add .

# Создайте коммит с описанием изменений
git commit -m "Описание изменений"

# Загрузите на GitHub
git push
```

### 5.2. Полезные команды Git

```bash
# Просмотр статуса изменений
git status

# Просмотр истории коммитов
git log

# Просмотр изменений в файлах
git diff

# Отмена изменений в файле (до добавления в staging)
git checkout -- имя_файла

# Отмена добавления файла в staging
git reset HEAD имя_файла

# Просмотр удаленных репозиториев
git remote -v

# Получение изменений с GitHub
git pull
```

---

## 🔐 НАСТРОЙКА АВТОРИЗАЦИИ

### Вариант A: HTTPS с Personal Access Token (РЕКОМЕНДУЕТСЯ)

GitHub больше не поддерживает пароли для HTTPS. Нужно использовать Personal Access Token:

1. Перейдите на GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Нажмите "Generate new token (classic)"
3. Выберите срок действия и права доступа (минимум `repo`)
4. Скопируйте токен (он покажется только один раз!)
5. При `git push` используйте токен вместо пароля:
   - Username: ваш логин GitHub
   - Password: вставьте токен

**Или настройте кэширование:**

```bash
# Настройка кэширования учетных данных
git config --global credential.helper wincred
```

### Вариант B: SSH ключи (более безопасно)

**Шаг 1: Генерация SSH ключа**

```bash
# Генерация SSH ключа
ssh-keygen -t ed25519 -C "ваш_email@example.com"

# Нажмите Enter для всех вопросов (или укажите свой путь)
```

**Шаг 2: Добавление SSH ключа в GitHub**

```bash
# Просмотр публичного ключа
cat ~/.ssh/id_ed25519.pub
```

Скопируйте весь вывод (начинается с `ssh-ed25519`).

1. Перейдите на GitHub → Settings → SSH and GPG keys
2. Нажмите "New SSH key"
3. Вставьте скопированный ключ
4. Нажмите "Add SSH key"

**Шаг 3: Использование SSH URL**

```bash
# Измените remote на SSH
git remote set-url origin git@github.com:ваш-username/StreamDesk.git

# Проверка подключения
ssh -T git@github.com
```

---

## ⚠️ ВАЖНЫЕ ЗАМЕЧАНИЯ

### Что НЕ нужно загружать на GitHub:

1. **Файл `.env`** - содержит секретные данные (пароли, ключи)
2. **Папка `node_modules/`** - зависимости (устанавливаются через `npm install`)
3. **Папка `dist/`** - собранные файлы (создаются при сборке)
4. **Папка `uploads/`** - загруженные пользователями файлы
5. **SSL сертификаты** (`.key`, `.crt`, `.pem`)
6. **Базы данных** (`.db`, `.sqlite`)

### Что ОБЯЗАТЕЛЬНО должно быть на GitHub:

1. **Исходный код** (`client/src/`, `server/`, `shared/`)
2. **Конфигурационные файлы** (`package.json`, `tsconfig.json`, `vite.config.ts`)
3. **Документация** (`.md` файлы)
4. **Файл `.gitignore`**
5. **Файл `README.md`** (описание проекта)

---

## 🚀 БЫСТРАЯ ИНСТРУКЦИЯ (КОРОТКАЯ ВЕРСИЯ)

```bash
# 1. Перейдите в папку проекта
cd D:\StreamDesk

# 2. Инициализируйте Git (если еще не сделано)
git init

# 3. Добавьте все файлы
git add .

# 4. Создайте первый коммит
git commit -m "Initial commit"

# 5. Переименуйте ветку в main
git branch -M main

# 6. Подключите удаленный репозиторий (замените URL!)
git remote add origin https://github.com/ваш-username/StreamDesk.git

# 7. Загрузите на GitHub
git push -u origin main
```

---

## 🆘 РЕШЕНИЕ ПРОБЛЕМ

### Проблема: "fatal: remote origin already exists"

**Решение:**
```bash
# Удалите старый remote
git remote remove origin

# Добавьте новый
git remote add origin https://github.com/ваш-username/StreamDesk.git
```

### Проблема: "Permission denied" или "Authentication failed"

**Решение:**
- Используйте Personal Access Token вместо пароля
- Или настройте SSH ключи (см. выше)

### Проблема: "failed to push some refs"

**Решение:**
```bash
# Получите изменения с GitHub
git pull origin main --allow-unrelated-histories

# Разрешите конфликты (если есть)
# Затем снова загрузите
git push -u origin main
```

### Проблема: Файл `.env` случайно загружен

**Решение:**
```bash
# Удалите файл из Git (но оставьте локально)
git rm --cached .env

# Создайте коммит
git commit -m "Remove .env from repository"

# Загрузите изменения
git push

# Убедитесь, что .env в .gitignore
```

---

## 📝 СОЗДАНИЕ README.md

Создайте файл `README.md` в корне проекта с описанием:

```markdown
# StreamDesk

Система управления стримингом и оборудованием.

## Возможности

- Управление оборудованием
- Планирование событий
- Схемы подключения
- Управление задачами
- И многое другое...

## Установка

\`\`\`bash
npm install
cd client && npm install && npm run build && cd ..
npm run dev
\`\`\`

## Лицензия

MIT
```

---

**Готово! Ваш проект теперь на GitHub! 🎉**

