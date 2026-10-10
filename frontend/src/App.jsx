import { useEffect, useRef, useState } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";

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
  const ydocRef = useRef(null);
  const bindingRef = useRef(null);
  const textObserverRef = useRef(null);
  const updateHandlerRef = useRef(null);

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    const applyDocumentUpdate = (update) => {
      if (ydocRef.current && update instanceof Uint8Array) {
        try {
          Y.applyUpdate(ydocRef.current, update, "socket");
        } catch {
          setJoinError("Received an invalid document update.");
        }
      }
    };

    socket.on("documentState", applyDocumentUpdate);
    socket.on("documentUpdate", applyDocumentUpdate);

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
      socket.off("documentState", applyDocumentUpdate);
      socket.off("documentUpdate", applyDocumentUpdate);
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

      const sharedDoc = new Y.Doc();
      const source = sharedDoc.getText("source");
      const handleTextChange = () => setCode(source.toString());
      const handleDocumentUpdate = (update, origin) => {
        if (origin !== "socket") {
          socket.emit("documentUpdate", { update });
          socket.emit("typing");
        }
      };

      source.observe(handleTextChange);
      sharedDoc.on("update", handleDocumentUpdate);
      ydocRef.current = sharedDoc;
      textObserverRef.current = handleTextChange;
      updateHandlerRef.current = handleDocumentUpdate;

      socket.emit("join", { roomId, userName }, (response) => {
        if (response?.ok) {
          setJoined(true);
        } else {
          source.unobserve(handleTextChange);
          sharedDoc.off("update", handleDocumentUpdate);
          sharedDoc.destroy();
          ydocRef.current = null;
          textObserverRef.current = null;
          updateHandlerRef.current = null;
          setJoinError(response?.error || "Unable to join this room.");
        }
      });
    }
  };

  const disposeSharedDocument = () => {
    bindingRef.current?.();
    bindingRef.current = null;

    const sharedDoc = ydocRef.current;
    if (sharedDoc) {
      const source = sharedDoc.getText("source");
      if (textObserverRef.current) {
        source.unobserve(textObserverRef.current);
      }
      if (updateHandlerRef.current) {
        sharedDoc.off("update", updateHandlerRef.current);
      }
      sharedDoc.destroy();
    }

    ydocRef.current = null;
    textObserverRef.current = null;
    updateHandlerRef.current = null;
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    disposeSharedDocument();
    setJoined(false);
    setRoomId("");
    setUserName("");
    setLanguage("javascript");
    setCode("");
  };

  const handleEditorMount = (editor) => {
    const sharedDoc = ydocRef.current;
    const model = editor.getModel();
    if (!sharedDoc || !model) return;

    const source = sharedDoc.getText("source");
    const editorOrigin = {};
    let applyingRemoteUpdate = false;

    const handleModelChange = ({ changes }) => {
      if (applyingRemoteUpdate) return;

      sharedDoc.transact(() => {
        [...changes]
          .sort((left, right) => right.rangeOffset - left.rangeOffset)
          .forEach(({ rangeOffset, rangeLength, text }) => {
            if (rangeLength > 0) source.delete(rangeOffset, rangeLength);
            if (text) source.insert(rangeOffset, text);
          });
      }, editorOrigin);
    };

    const handleSharedTextChange = (event) => {
      if (event.transaction.origin === editorOrigin) return;

      applyingRemoteUpdate = true;
      try {
        let index = 0;
        event.delta.forEach((operation) => {
          if (operation.retain !== undefined) {
            index += operation.retain;
          } else if (operation.insert !== undefined) {
            const position = model.getPositionAt(index);
            model.applyEdits([{
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
              text: operation.insert,
            }]);
            index += operation.insert.length;
          } else if (operation.delete !== undefined) {
            const start = model.getPositionAt(index);
            const end = model.getPositionAt(index + operation.delete);
            model.applyEdits([{
              range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
              },
              text: "",
            }]);
          }
        });
      } finally {
        applyingRemoteUpdate = false;
      }
    };

    source.observe(handleSharedTextChange);
    const modelSubscription = model.onDidChangeContent(handleModelChange);
    bindingRef.current = () => {
      source.unobserve(handleSharedTextChange);
      modelSubscription.dispose();
    };
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
            <h1>Collaborative IDE</h1>
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
          onMount={handleEditorMount}
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
