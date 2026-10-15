import { useEffect, useRef, useState } from "react";
import "./App.css";
import io from "socket.io-client";
import * as Y from "yjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeYjsUpdate, replaceSharedText } from "./shared-text.js";

const socketUrl =
  import.meta.env.VITE_SERVER_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : window.location.origin);
const socket = io(socketUrl);

const App = () => {
  const [joined, setJoined] = useState(false);
  const [documentReady, setDocumentReady] = useState(false);
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get("room") || ""
  );
  const [userName, setUserName] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [shareStatus, setShareStatus] = useState("");
  const ydocRef = useRef(null);
  const textObserverRef = useRef(null);
  const titleObserverRef = useRef(null);
  const updateHandlerRef = useRef(null);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    const applyDocumentUpdate = (update) => {
      const updateBytes = normalizeYjsUpdate(update);
      if (!ydocRef.current || !updateBytes) return;

      try {
        Y.applyUpdate(ydocRef.current, updateBytes, "socket");
        setDocumentReady(true);
      } catch {
        setJoinError("Received an invalid document update.");
      }
    };

    socket.on("documentState", applyDocumentUpdate);
    socket.on("documentUpdate", applyDocumentUpdate);

    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });

    return () => {
      socket.off("userJoined");
      socket.off("documentState", applyDocumentUpdate);
      socket.off("documentUpdate", applyDocumentUpdate);
      socket.off("userTyping");
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
      setDocumentReady(false);

      const sharedDoc = new Y.Doc();
      const source = sharedDoc.getText("source");
      const sharedTitle = sharedDoc.getText("title");
      const handleTextChange = () => setContent(source.toString());
      const handleTitleChange = () => setTitle(sharedTitle.toString());
      const handleDocumentUpdate = (update, origin) => {
        if (origin !== "socket") {
          const saveSequence = ++saveSequenceRef.current;
          setSaveStatus("Saving...");
          socket.emit("documentUpdate", { update }, (response) => {
            if (saveSequence === saveSequenceRef.current) {
              setSaveStatus(response?.ok ? "Saved" : "Save failed");
            }
          });
          socket.emit("typing");
        }
      };

      source.observe(handleTextChange);
      sharedTitle.observe(handleTitleChange);
      sharedDoc.on("update", handleDocumentUpdate);
      ydocRef.current = sharedDoc;
      textObserverRef.current = handleTextChange;
      titleObserverRef.current = handleTitleChange;
      updateHandlerRef.current = handleDocumentUpdate;

      socket.emit("join", { roomId, userName }, (response) => {
        if (response?.ok) {
          setJoined(true);
          setSaveStatus("Saved");
        } else {
          source.unobserve(handleTextChange);
          sharedTitle.unobserve(handleTitleChange);
          sharedDoc.off("update", handleDocumentUpdate);
          sharedDoc.destroy();
          ydocRef.current = null;
          setDocumentReady(false);
          textObserverRef.current = null;
          titleObserverRef.current = null;
          updateHandlerRef.current = null;
          setJoinError(response?.error || "Unable to join this room.");
        }
      });
    }
  };

  const disposeSharedDocument = () => {
    const sharedDoc = ydocRef.current;
    if (sharedDoc) {
      const source = sharedDoc.getText("source");
      const sharedTitle = sharedDoc.getText("title");
      if (textObserverRef.current) {
        source.unobserve(textObserverRef.current);
      }
      if (titleObserverRef.current) {
        sharedTitle.unobserve(titleObserverRef.current);
      }
      if (updateHandlerRef.current) {
        sharedDoc.off("update", updateHandlerRef.current);
      }
      sharedDoc.destroy();
    }

    ydocRef.current = null;
    textObserverRef.current = null;
    titleObserverRef.current = null;
    updateHandlerRef.current = null;
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    disposeSharedDocument();
    setJoined(false);
    setDocumentReady(false);
    setRoomId("");
    setUserName("");
    setTitle("");
    setContent("");
    setIsPreview(false);
    setSaveStatus("Saved");
    setShareStatus("");
  };

  const handleContentChange = (event) => {
    if (ydocRef.current) {
      replaceSharedText(ydocRef.current, "source", event.target.value);
    }
  };

  const handleTitleChange = (event) => {
    if (ydocRef.current) {
      replaceSharedText(ydocRef.current, "title", event.target.value);
    }
  };

  const copyInviteLink = async () => {
    const inviteUrl = new URL(window.location.href);
    inviteUrl.searchParams.set("room", roomId);

    try {
      await navigator.clipboard.writeText(inviteUrl.toString());
      setShareStatus("Link copied");
    } catch {
      setShareStatus("Copy unavailable");
    }
    window.setTimeout(() => setShareStatus(""), 2000);
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <p className="eyebrow">A shared space to write</p>
          <h1>Collaborative Editor</h1>
          <input
            type="text"
            placeholder="Document room"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            aria-label="Document room"
          />
          <input
            type="text"
            placeholder="Your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            aria-label="Your name"
          />
          {joinError && <p role="alert">{joinError}</p>}
          <button onClick={joinRoom}>Open document</button>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar">
        <div className="room-info">
          <span className="brand-mark" aria-hidden="true">C</span>
          <div>
            <p className="eyebrow">DOCUMENT</p>
            <h2>{roomId}</h2>
          </div>
        </div>
        <div className="presence-heading">
          <h3>In this room</h3>
          <span>{users.length}</span>
        </div>
        <ul className="user-list">
          {users.map((user, index) => (
            <li key={`${user}-${index}`}>
              <span className="user-avatar" aria-hidden="true">{user.charAt(0).toUpperCase()}</span>
              <span>{user}</span>
              {user === userName && <span className="you-label">you</span>}
            </li>
          ))}
        </ul>
        <p className="typing-indicator" aria-live="polite">{typing}</p>
        <button className="leave-button" onClick={leaveRoom}>Leave document</button>
      </div>

      <div className="editor-wrapper">
        <header className="document-toolbar">
          <div className="document-heading">
            <p className="eyebrow">LIVE DOCUMENT</p>
            <input
              className="document-title-input"
              value={title}
              onChange={handleTitleChange}
              aria-label="Document title"
              maxLength={120}
              disabled={!documentReady}
            />
          </div>
          <div className="document-actions">
            <span className="save-status" aria-live="polite">{saveStatus}</span>
            <button className="share-button" onClick={copyInviteLink}>
              {shareStatus || "Copy link"}
            </button>
            <div className="editor-mode" role="group" aria-label="Document view">
              <button
                className={!isPreview ? "active" : ""}
                aria-pressed={!isPreview}
                onClick={() => setIsPreview(false)}
              >
                Write
              </button>
              <button
                className={isPreview ? "active" : ""}
                aria-pressed={isPreview}
                onClick={() => setIsPreview(true)}
              >
                Preview
              </button>
            </div>
          </div>
        </header>
        <main className="document-page">
          {isPreview ? (
            <article className="markdown-preview" aria-label="Markdown preview">
              {content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown> : "Nothing to preview yet."}
            </article>
          ) : (
            <textarea
              className="document-canvas"
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing in Markdown..."
              aria-label="Shared document content"
              spellCheck="true"
              disabled={!documentReady}
            />
          )}
          <footer className="document-footer">
            <span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span>
            <span>{typing}</span>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default App;