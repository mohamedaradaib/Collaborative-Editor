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
- Socket.IO
- Monaco Editor
- Axios
- UUID

## How It Works
The frontend provides the editor interface, while the backend manages communication between connected clients. When a user joins a room, the server stores that user and broadcasts the current code state to everyone in the room. As code changes are made, they are sent over Socket.IO so all users stay synchronized. The app also supports code execution by sending the current code to an external execution service and returning the output.

## Getting Started
### Prerequisites
- Node.js 18+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/mohamedaradaib/Collaborative-IDE.git
cd Collaborative-IDE
```

2. Install backend dependencies:
```bash
cd backend
npm install
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

### Run the Application

Open two terminals.

#### Terminal 1: Start the backend
```bash
cd Collaborative-IDE/backend
npm run start
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

