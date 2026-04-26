# Real-Time Traffic Analyzer

A real-time traffic dashboard for Nginx logs, built with Crystal and WebSockets.

## Features
- Real-time Nginx access and error log tailing.
- **Historical Data:** Automatically loads the last 200 access logs and 20 error logs upon connection.
- WebSocket-based streaming to a beautiful web dashboard.
- Live analytics: Requests per second, status codes, top IPs, and top endpoints.
- Error spike detection.
- **Secure Access:** Integrated Crystal-based login system with session cookies (HTTP Only).
- Dynamic port allocation to avoid conflicts.

## Setup Instructions
1. Install Crystal (`curl -fsSL https://crystal-lang.org/install.sh | sudo bash`).
2. Run `shards install` in `traffic-analyzer/` directory to fetch dependencies.
3. Make sure `/var/log/nginx/access.log` and `error.log` exist and are readable by the user.

## How to Run
Navigate to `traffic-analyzer/` and compile the app:
```bash
crystal build src/analyzer.cr --release -o bin/analyzer
./bin/analyzer
```
The app will automatically find an available port starting from 8070.

## Architecture Overview
- **Backend:** Crystal with Kemal. Treads tail the Nginx logs without blocking. WebSockets push JSON data to connected clients.
- **Frontend:** Vanilla JavaScript with Chart.js for real-time graphs.
- **Reverse Proxy:** Nginx acts as a reverse proxy on `crystal.micutu.com` and provides SSL via Let's Encrypt.
