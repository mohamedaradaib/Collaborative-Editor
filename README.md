# Collaborative IDE

A browser-based collaborative code editor where multiple users can join a room and work on the same code in real time.

## Features
- Real-time collaborative editing with concurrent changes merged automatically
- Room-based sessions with active user presence and typing indicators
- Shared language selection for JavaScript, Python, and Java
- Code execution with standard input and output
- Persistent room source code and language settings

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
- Yjs
- Monaco Editor
- Piston API

## How It Works
The frontend binds Monaco Editor to a shared Yjs document. Yjs merges concurrent edits, and Socket.IO synchronizes document updates, language changes, and room presence between connected users. The backend stores each room's source code and language in SQLite. When a user runs code, the backend sends the source and standard input to the external Piston service and returns the result to the room. Rooms do not require sign-in, so anyone who knows a room name can join; do not use private or sensitive code. Code execution is limited to one run every two seconds per connected client.

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
npm --prefix frontend install
```

### Run the Application

Open two terminals from the project root.

#### Terminal 1: Start the backend
```bash
npm start
```

#### Terminal 2: Start the frontend
```bash
npm --prefix frontend run dev -- --host 0.0.0.0
```

Open the Vite localhost URL - `http://localhost:5173`

## Live Demo

## License
[LICENSE](./LICENSE)

