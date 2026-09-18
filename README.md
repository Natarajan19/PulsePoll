# PulsePoll — Complete Final

A production-oriented live polling application for the GUVI Developer Internship task.

## Included

- React + TypeScript + Vite frontend
- Go + Gin backend
- MongoDB persistence
- Redis Pub/Sub + WebSocket live updates
- JWT + bcrypt authentication
- Six-character poll sharing
- Shareable poll URL
- QR code join flow
- Presenter mode with live results
- Fullscreen presenter mode
- Native share / copy link
- CSV results export
- Live connection status
- Responsive audience voting UI
- Backend/frontend separation

## Architecture

```text
Audience / Presenter Browser
          |
          | HTTP + WebSocket
          v
     React / Vite
       :5173
          |
          v
      Go / Gin API
        :8080
       /      \
      v        v
 MongoDB     Redis
             Pub/Sub
                |
             WebSocket
```

## Local setup

### 1. Backend

```powershell
cd backend
copy .env.example .env
notepad .env
```

Set your MongoDB Atlas connection string and a strong JWT secret. Keep the Redis URL appropriate for your setup.

Start Redis with Docker Desktop:

```powershell
docker compose up -d redis
```

Then:

```powershell
go mod tidy
go run .
```

The API should listen on `http://localhost:8080`.

### 2. Frontend

Open a second PowerShell window:

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Demo flow

1. Sign up / sign in.
2. Create a poll.
3. Copy the six-character code or share URL.
4. Scan the QR code with a phone, or open the URL in another browser/incognito window.
5. Vote from the audience device.
6. Keep the results/presenter screen open.
7. Results update through the WebSocket connection without a refresh.
8. Use Presenter View for a fullscreen-style live presentation.
9. Export the displayed results as CSV.

## Important production notes

Do not commit `.env` files or secrets. The included `.gitignore` excludes them.

For production, use:

```env
VITE_API_URL=https://YOUR-BACKEND-DOMAIN
VITE_WS_URL=wss://YOUR-BACKEND-DOMAIN
```

Backend environment values should include your production MongoDB URI, Redis URL, JWT secret, and frontend origin.

The backend must be deployed to a service that supports long-lived WebSocket connections. The frontend can be deployed to a static hosting service.
