# 🔐 Установка SSL сертификата от reg.ru

## 📥 Шаг 1: Получение сертификата

1. Войдите в панель управления reg.ru
2. Перейдите в раздел "SSL сертификаты"
3. Найдите ваш сертификат для streamdesk.ru
4. Скачайте файлы:
   - **Сертификат** (обычно `.crt` или `.pem`)
   - **Приватный ключ** (обычно `.key`)

## 📤 Шаг 2: Загрузка на сервер

### Вариант A: Через SCP (с Windows)

```powershell
# В PowerShell на вашем компьютере
scp путь/к/certificate.crt username@IP_сервера:/tmp/streamdesk.ru.crt
scp путь/к/private.key username@IP_сервера:/tmp/streamdesk.ru.key
```

### Вариант B: Через WinSCP/FileZilla

1. Подключитесь к серверу через SFTP
2. Загрузите файлы сертификата во временную папку `/tmp`

## 🔧 Шаг 3: Установка на сервере

```bash
# Подключитесь к серверу
ssh username@IP_сервера

# Создайте директории для сертификатов
sudo mkdir -p /etc/ssl/certs
sudo mkdir -p /etc/ssl/private

# Переместите сертификаты
sudo mv /tmp/streamdesk.ru.crt /etc/ssl/certs/
sudo mv /tmp/streamdesk.ru.key /etc/ssl/private/

# Установите правильные права
sudo chmod 644 /etc/ssl/certs/streamdesk.ru.crt
sudo chmod 600 /etc/ssl/private/streamdesk.ru.key

# Проверьте, что файлы на месте
sudo ls -la /etc/ssl/certs/streamdesk.ru.crt
sudo ls -la /etc/ssl/private/streamdesk.ru.key
```

## ⚙️ Шаг 4: Настройка Nginx

Откройте конфигурацию Nginx:

```bash
sudo nano /etc/nginx/sites-available/streamdesk.ru
```

Убедитесь, что пути к сертификатам указаны правильно:

```nginx
ssl_certificate /etc/ssl/certs/streamdesk.ru.crt;
ssl_certificate_key /etc/ssl/private/streamdesk.ru.key;
```

## ✅ Шаг 5: Проверка

```bash
# Проверьте конфигурацию Nginx
sudo nginx -t

# Если всё ОК, перезапустите Nginx
sudo systemctl restart nginx

# Проверьте статус
sudo systemctl status nginx
```

## 🧪 Шаг 6: Тестирование SSL

```bash
# Проверьте сертификат
openssl x509 -in /etc/ssl/certs/streamdesk.ru.crt -text -noout

# Проверьте подключение
curl -v https://streamdesk.ru
```

## 🔄 Обновление сертификата

Когда сертификат истечет, повторите шаги 1-5.

## ⚠️ Важные замечания

1. **Приватный ключ должен быть секретным** - не делитесь им ни с кем
2. **Права доступа** - ключ должен быть доступен только root (600)
3. **Путь к файлам** - убедитесь, что пути в Nginx совпадают с реальными путями
4. **Цепочка сертификатов** - если reg.ru предоставил промежуточные сертификаты, объедините их:

```bash
# Если есть промежуточный сертификат
cat /etc/ssl/certs/streamdesk.ru.crt /etc/ssl/certs/intermediate.crt > /etc/ssl/certs/streamdesk.ru-chain.crt

# И используйте в Nginx:
ssl_certificate /etc/ssl/certs/streamdesk.ru-chain.crt;
```

## 🆘 Проблемы

### Ошибка: "SSL: error:0B080074:x509 certificate routines"

**Решение:** Проверьте формат файла. Убедитесь, что это PEM формат (начинается с `-----BEGIN CERTIFICATE-----`)

### Ошибка: "SSL: error:0906D06C:PEM routines"

**Решение:** Проверьте права доступа к файлам:
```bash
sudo chmod 644 /etc/ssl/certs/streamdesk.ru.crt
sudo chmod 600 /etc/ssl/private/streamdesk.ru.key
```

### Ошибка: "certificate has expired"

**Решение:** Сертификат истек. Обновите его в панели reg.ru и повторите установку.

---

Готово! 🎉

