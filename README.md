# Collaborative IDE

A real-time collaborative development environment that allows multiple users to join the same room and work on code together in the browser.

## Features
- Real-time collaborative coding
- Shared room-based sessions
- Active user tracking
- Code execution feedback
- Support for editor interactions and language updates

## Tech Stack
- JavaScript
- HTML
- CSS
- React
- Vite
- Node.js
- Express.js
- SQLite
- Socket.IO
- Monaco Editor
- Axios
- UUID

## How It Works
The frontend provides the editor interface, while the backend manages communication between connected clients. When a user joins a room, the server stores that user and broadcasts the current code state to everyone in the room. As code changes are made, they are sent over Socket.IO so all users stay synchronized. The app also supports code execution by sending the current code to an external execution service and returning the output.

Room source code is persisted in a local SQLite database at `backend/data/editor.sqlite`. Set the `DATABASE_PATH` environment variable to use a different database file. Connected users and other live session state remain in memory.

For deployments where the frontend and backend use different origins, set `VITE_SERVER_URL` to the backend URL and `CLIENT_ORIGIN` to the frontend origin. `CLIENT_ORIGIN` accepts a comma-separated list; local development defaults to `http://localhost:5173`.

## Getting Started
### Prerequisites
- Node.js 18+

### Installation

1. Clone the repository and install backend dependencies from the project root:
```bash
git clone https://github.com/mohamedaradaib/Collaborative-IDE.git
cd Collaborative-IDE
npm install
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
```

### Run the Application

Open two terminals.

#### Terminal 1: Start the backend
```bash
cd Collaborative-IDE/backend
npm start
```

#### Terminal 2: Start the frontend
```bash
cd Collaborative-IDE/frontend
npm run dev -- --host 0.0.0.0
```

Open the Vite localhost URL - `http://localhost:5173`

## Live Demo

## License
[LICENSE](./LICENSE)

