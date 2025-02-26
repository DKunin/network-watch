# Network Monitor & Auto Deployment

This project monitors devices on your WiFi network and logs when they go online/offline. It also includes a web UI to check uptime history for any device. The system is **automatically deployed** to a personal server when new code is pushed to GitHub.

## Features
- **Network Monitoring**: Detects when devices connect/disconnect.
- **Logs Data**: Stores uptime history in a JSON-based database.
- **Telegram Notifications**: Sends alerts when devices go online/offline.
- **Web UI**: View uptime for specific devices on selected dates.
- **Auto Deployment**: Automatically pulls the latest code and restarts the server on `git push`.