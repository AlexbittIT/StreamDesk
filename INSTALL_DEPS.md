# Установка зависимостей для транскрибации

## Проблема

Если вы видите ошибку `Cannot find package 'docx'`, это означает, что не установлены необходимые зависимости.

## Решение

Выполните одну из следующих команд в терминале:

### Вариант 1: Через CMD (рекомендуется)

Откройте **Command Prompt** (cmd.exe, не PowerShell) и выполните:

```cmd
cd D:\StreamDesk
npm install docx pdfkit form-data node-fetch@2
```

### Вариант 2: Через PowerShell с обходом политики

В PowerShell выполните:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
cd D:\StreamDesk
npm install docx pdfkit form-data node-fetch@2
```

### Вариант 3: Установка всех зависимостей

Если вы хотите установить все зависимости из `package.json`:

```cmd
cd D:\StreamDesk
npm install
```

## Проверка установки

После установки проверьте, что пакеты установлены:

```cmd
npm list docx pdfkit form-data node-fetch
```

Должны быть видны установленные версии пакетов.

## После установки

Перезапустите сервер разработки:

```cmd
npm run dev
```

Теперь транскрибация должна работать корректно!

