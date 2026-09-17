# Network Monitor & Auto Deployment

This project monitors devices on your WiFi network and logs when they go online/offline. It also includes a web UI to check uptime history for any device. The system is **automatically deployed** to a personal server when new code is pushed to GitHub.

Продакшен-интерфейс доступен на `https://network.kunini.ru` и защищен общей сессией `auth.kunini.ru`. JSON API публикуется под префиксом `/api`; прямой backend слушает только `127.0.0.1:3031` и доверяет identity-заголовкам только от локального Nginx.

## Features
- **Network Monitoring**: Detects when devices connect/disconnect.
- **Logs Data**: Stores uptime history in a JSON-based database.
- **Telegram Notifications**: Sends alerts when devices go online/offline.
- **Web UI**: View daily, hourly, and weekly uptime for specific devices.
- **Auto Deployment**: Automatically pulls the latest code and restarts the server on `git push`.

## Настройка устройств

Список отслеживаемых устройств хранится в `src/devices.js` и отдается клиентам через `GET /api/devices`. Сейчас настроены:

- `192.168.28.230`: Computer.
- `192.168.28.40`: Kir.
- `192.168.28.22`: Den TV.
- `192.168.28.50`: Kir's TV.

Веб-интерфейс и мобильное приложение берут список устройств из API, поэтому отдельный список в клиентах обновлять не нужно.

Веб-интерфейс собран в единый экран без прокрутки на десктопе: список устройств, почасовая активность за выбранную дату и семидневный график находятся рядом. Выбранную дату можно менять через календарь или кнопками перехода на предыдущий и следующий день. Управление Telegram-уведомлениями в интерфейсе не отображается.

## Настройка домена и HTTPS

После появления DNS-записи установите Nginx-конфигурацию на сервере:

```bash
cd /var/apps/network-watch
./ops/nginx/install-network-site.sh
```

Скрипт проверяет конфигурацию, подключает виртуальный хост, выпускает или переиспользует сертификат Certbot и выполняет graceful reload Nginx.
