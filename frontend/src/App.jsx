import { useEffect, useState } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";

const socketUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : window.location.origin);
const socket = io(socketUrl);

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [outPut, setOutPut] = useState("");
  const [executionMessage, setExecutionMessage] = useState("");
  const [runCooldown, setRunCooldown] = useState(false);
  const version = "*";
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    socket.on("codeUpdate", (newCode) => {
      setCode(newCode);
    });

    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", (newLanguage) => {
      setLanguage(newLanguage);
    });

    socket.on("codeResponse", (response) => {
      setOutPut(response.run.output);
      setExecutionMessage("");
    });

    socket.on("executionError", setExecutionMessage);

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("userTyping");
      socket.off("languageUpdate");
      socket.off("codeResponse");
      socket.off("executionError");
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      setJoinError("");
      socket.emit("join", { roomId, userName }, (response) => {
        if (response?.ok) {
          setJoined(true);
        } else {
          setJoinError(response?.error || "Unable to join this room.");
        }
      });
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setLanguage("javascript");
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("codeChange", { roomId, code: newCode });
    socket.emit("typing", { roomId, userName });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    socket.emit("languageChange", { roomId, language: newLanguage });
  };

  const [userInput, setUserInput] = useState("");

  const runCode = () => {
    if (runCooldown) return;
    setExecutionMessage("");
    setRunCooldown(true);
    setTimeout(() => setRunCooldown(false), 2000);
    socket.emit("compileCode", {
      code,
      roomId,
      language,
      version,
      input: userInput,
    });
  };

  if (!joined) {
    return (
      <>
        <div className="join-container">
          <div className="join-form">
            <h1>Collaborative Editor</h1>
            <p className="demo-notice">
              Demo rooms are open to anyone who knows the room name. Do not share private code.
            </p>
            <input
              type="text"
              placeholder="Room"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
            <input
              type="text"
              placeholder="Username"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
            {joinError && <p role="alert">{joinError}</p>}
            <button onClick={joinRoom}>Enter</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="editor-container">
      <div className="sidebar">
        <div className="room-info">
          <h2>Room: {roomId}</h2>
          <p className="demo-notice">
            Room names are not private. Simultaneous edits may overwrite each other.
          </p>
        </div>
        <h3>Users</h3>
        <ul>
          {users.map((user, index) => (
            <li key={index}>{user.slice(0, 8)}</li>
          ))}
        </ul>
        <p className="typing-indicator">{typing}</p>
        <select
          className="language-selector"
          value={language}
          onChange={handleLanguageChange}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
        </select>
        <button className="run-btn" onClick={runCode} disabled={runCooldown}>
          {runCooldown ? "Wait..." : "Run"}
        </button>
        {executionMessage && <p className="execution-message" role="status">{executionMessage}</p>}
        <button className="leave-button" onClick={leaveRoom}>
          Exit
        </button>

        <div className="footer">
          <p>Collaborative Editor</p>
        </div>
      </div>

      <div className="editor-wrapper">
        <Editor
          height={"60%"}
          defaultLanguage={language}
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
          }}
        />
        <textarea
          className="input-console"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Input"
        />
        <textarea
          className="output-console"
          value={outPut}
          readOnly
          placeholder="Output"
        />
      </div>
      </div>
    </>
  );
};

export default App;
