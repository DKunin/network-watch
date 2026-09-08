# Network Monitor & Auto Deployment

This project monitors devices on your WiFi network and logs when they go online/offline. It also includes a web UI to check uptime history for any device. The system is **automatically deployed** to a personal server when new code is pushed to GitHub.

## Features
- **Network Monitoring**: Detects when devices connect/disconnect.
- **Logs Data**: Stores uptime history in a JSON-based database.
- **Telegram Notifications**: Sends alerts when devices go online/offline.
- **Web UI**: View daily, hourly, and weekly uptime for specific devices.
- **Auto Deployment**: Automatically pulls the latest code and restarts the server on `git push`.

## Настройка устройств

Список отслеживаемых устройств хранится в `src/devices.js` и отдается клиентам через `GET /devices`. Сейчас настроены:

- `192.168.28.230`: Computer.
- `192.168.28.40`: Kir.
- `192.168.28.22`: Den TV.
- `192.168.28.50`: Kir's TV.

Веб-интерфейс и мобильное приложение берут список устройств из API, поэтому отдельный список в клиентах обновлять не нужно.

Веб-интерфейс показывает почасовую активность выбранного устройства за выбранную дату, включая общее время онлайн и самый активный час.
