import React, { useEffect, useRef, useState, memo, useCallback } from "react";
import { useSocket } from "../context/SocketProvider";
import { useParams, useNavigate } from "react-router-dom";
import PeerService from "../services/Peer";
import '../Room.css';

// Xóa bỏ logic reload check cũ kỹ gây lỗi
// let reloadHandled = false; 

const formatBytes = (bytes, decimals = 2) => {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const VideoPlayer = memo(({ stream, isLocal, email, id, onPin, isPinned }) => {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.error("Video play error:", e));
    }
  }, [stream]);

  return (
    <div className={`video-wrapper ${isPinned ? 'pinned' : ''} ${!stream ? 'no-stream' : ''}`} onClick={() => onPin(id)}>
      {stream ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} style={isLocal ? { transform: "scaleX(-1)" } : {}} />
      ) : (
        <div className="camera-off"><span>📷</span><p>{isLocal ? "My Camera" : "Connecting..."}</p></div>
      )}
      <div className="user-tag">{isPinned && "📌 "}{email}</div>
    </div>
  );
});

const ProgressItem = ({ id, name, progress, type, status, onCancel }) => (
  <div className={`progress-item ${type} ${status}`}>
    <div className="progress-header">
      <small>
        {status === 'cancelled' ? '❌ Cancelled' :
          status === 'completed' ? '✅ Completed' :
            progress === 100 ? '✅ Done' :
              type === 'upload' ? '📤 Sending...' : `📥 Receiving ${name}...`}
      </small>
      {status !== 'cancelled' && status !== 'completed' && progress !== 100 && (
        <button className="btn-close-mini" onClick={onCancel} title="Cancel Transfer">×</button>
      )}
    </div>
    <div className="progress-item-inner">
      <div className="progress-bar">
        <div className={`progress-fill ${status === 'cancelled' ? 'cancelled-bar' : ''}`} style={{ width: `${progress}%` }}></div>
      </div>
      <span>{progress}%</span>
    </div>
  </div>
);

const Room = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  // KHỚP TÊN THAM SỐ VỚI APP.JSX (/room/:roomID)
  const { roomID } = useParams();
  const myEmail = localStorage.getItem('userEmail') || 'Anonymous';
  // Nếu không có roomID (trường hợp hiếm), mới fallback về '1'
  const currentRoom = roomID || '1';

  const [myStream, setMyStream] = useState(null);
  const myStreamRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [pinnedId, setPinnedId] = useState('local');
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // File State
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [downloadProgress, setDownloadProgress] = useState({});

  // Feature State
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // Refs
  const peersRef = useRef({});
  const fileInputRef = useRef(null);
  const outboundFilesRef = useRef({});
  const inboundBuffersRef = useRef({});
  const activeTransfers = useRef(new Set());
  const progressTimers = useRef({});

  const handlePin = (id) => setPinnedId(prev => (prev === id ? null : id));

  const handleLeaveRoom = () => {
    // 1. Nhã hết track media
    if (myStreamRef.current) {
      myStreamRef.current.getTracks().forEach(track => track.stop());
    }
    // 2. Đóng kết nối Peer
    Object.values(peersRef.current).forEach(p => p.peer.close());
    // 3. Thông báo server (Best effort)
    socket.emit("user:leaving", { room: currentRoom });

    // 4. Force Reload về trang chủ (Đây là cách fix lỗi đăng nhập 2 lần)
    // Nó sẽ xóa sạch memory leak và state cũ
    window.location.href = "/";
  };

  // --- SCREEN SHARE ---
  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];

        Object.values(peersRef.current).forEach(p => {
          const sender = p.peer.getSenders().find(s => s.track.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });

        videoTrack.onended = () => { stopScreenShare(); };
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err) { console.error("Screen share error:", err); }
  };

  const stopScreenShare = () => {
    if (myStreamRef.current) {
      const originalTrack = myStreamRef.current.getVideoTracks()[0];
      Object.values(peersRef.current).forEach(p => {
        const sender = p.peer.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(originalTrack);
      });
    }
    setIsScreenSharing(false);
  };

  // --- RECORDING ---
  const startRecording = () => {
    const chunks = [];
    const tracks = [...(myStreamRef.current?.getTracks() || []), ...remoteStreams.flatMap(s => s.stream.getTracks())];
    if (tracks.length === 0) return;
    const stream = new MediaStream(tracks);
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.webm`;
      a.click();
    };
    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };
  const stopRecording = () => { mediaRecorder?.stop(); setIsRecording(false); };

  // --- CHAT LOGIC ---
  const handleSendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = JSON.stringify({ text: trimmed, time });

    Object.values(peersRef.current).forEach(p => {
      if (p.chatChannel && p.chatChannel.readyState === "open") p.chatChannel.send(payload);
    });

    setMessages(prev => [...prev, { id: Date.now(), text: trimmed, fromEmail: myEmail, fromSelf: true, time }]);
    setMessage("");
  };

  // --- FILE TRANSFER ---
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // --- SAFETY CHECK: 1GB LIMIT ---
    // Ngăn chặn Crash do tràn RAM (Browser OOM Limit ~1.4GB)
    const MAX_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB
    if (file.size > MAX_SIZE) {
      alert(`⚠️ File quá lớn (${formatBytes(file.size)})! Trình duyệt giới hạn dưới 1GB để tránh tràn bộ nhớ RAM.`);
      e.target.value = ""; // Reset input
      return;
    }
    // --------------------------------

    fileInputRef.current.value = "";

    const fileId = `file-${Date.now()}`;
    outboundFilesRef.current[fileId] = file;

    // --- DEMO EVIDENCE: SENDER SIDE ---
    console.log(`%c [P2P Sender] 📤 File Loaded into Memory Reference!`, 'color: #ff9900; font-weight: bold;');
    console.log(`📄 Name: ${file.name}`);
    console.log(`📦 Size: ${formatBytes(file.size)}`);
    // ----------------------------------

    let sentCount = 0;
    Object.values(peersRef.current).forEach(p => {
      if (p.fileChannel && p.fileChannel.readyState === "open") {
        try {
          p.fileChannel.send(JSON.stringify({ type: "file:offer", fileId, name: file.name, size: file.size }));
          sentCount++;
        } catch (err) { console.error("Send Offer Error", err); }
      }
    });

    if (sentCount === 0 && Object.keys(peersRef.current).length > 0) console.warn("Waiting for channels...");

    setFiles(prev => [...prev, { id: fileId, name: file.name, size: file.size, status: 'offered', type: 'sent' }]);
  };

  const handleCancelFile = (fileId) => {
    const file = files.find(f => f.id === fileId);
    if (!file) {
      activeTransfers.current.delete(fileId);
      return;
    }

    if (file.type === 'sent') {
      const keys = [...activeTransfers.current];
      keys.forEach(k => { if (k.startsWith(fileId)) activeTransfers.current.delete(k); });

      Object.values(peersRef.current).forEach(p => {
        if (p.fileChannel && p.fileChannel.readyState === "open") {
          try { p.fileChannel.send(JSON.stringify({ type: "file:cancel", fileId })); } catch (e) { }
        }
      });

      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'cancelled' } : f));
      setUploadProgress(prev => { let n = { ...prev }; delete n[fileId]; return n; });

    } else {
      const peerId = file.peerId;
      const transferKey = `${fileId}-${peerId}`;
      activeTransfers.current.delete(transferKey);

      if (progressTimers.current[fileId]) {
        clearInterval(progressTimers.current[fileId]);
        delete progressTimers.current[fileId];
      }

      if (peerId && peersRef.current[peerId]) {
        const p = peersRef.current[peerId];
        if (p.fileChannel && p.fileChannel.readyState === "open") {
          try { p.fileChannel.send(JSON.stringify({ type: "file:cancel", fileId })); } catch (e) { }
        }
      }

      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'cancelled' } : f));

      setDownloadProgress(prev => { let n = { ...prev }; delete n[fileId]; return n; });
      delete inboundBuffersRef.current[fileId];
    }
  };

  const setupFileLogic = (peer, email, id) => {
    peer.fileChannel.onmessage = (e) => {
      handleFileChannelMessage(e, peer, email, id);
    };
  };

  const handleFileChannelMessage = async (e, peer, email, id) => {
    if (typeof e.data === 'string') {
      try {
        const msg = JSON.parse(e.data);

        if (msg.type === 'file:offer') {
          setFiles(prev => {
            if (prev.find(f => f.id === msg.fileId)) return prev;
            return [...prev, { id: msg.fileId, peerId: id, name: msg.name, size: msg.size, status: 'pending', from: email, type: 'received' }];
          });

        } else if (msg.type === 'file:request') {
          const file = outboundFilesRef.current[msg.fileId];
          if (file) {
            const transferKey = `${msg.fileId}-${id}`;
            activeTransfers.current.add(transferKey);
            sendFileInChunks(peer, file, msg.fileId, id, transferKey);
          }

        } else if (msg.type === 'file:cancel') {
          const transferKey = `${msg.fileId}-${id}`;
          activeTransfers.current.delete(transferKey);
          setFiles(prev => prev.map(f => f.id === msg.fileId ? { ...f, status: 'cancelled' } : f));
          setDownloadProgress(prev => { let n = { ...prev }; delete n[msg.fileId]; return n; });
          setUploadProgress(prev => { let n = { ...prev }; delete n[msg.fileId]; return n; });
          delete inboundBuffersRef.current[msg.fileId];

        } else if (msg.type === 'file:ack') {
          // Người nhận báo đã nhận được chunk, sẵn sàng nhận tiếp
          activeTransfers.current.add(`ready-${msg.fileId}-${id}`);

        } else if (msg.type === 'file:complete') {
          const buffer = inboundBuffersRef.current[msg.fileId];
          if (!buffer) return;

          // Đợi ít nhất 6s mới cho phép hoàn tất (đồng bộ với sender)
          const elapsed = Date.now() - buffer.startTime;
          const waitTime = Math.max(0, 6000 - elapsed);

          setTimeout(() => {
            const blob = new Blob(buffer.chunks);
            const url = URL.createObjectURL(blob);

            setFiles(prev => prev.map(f => f.id === msg.fileId ? { ...f, status: 'completed', url } : f));
            setDownloadProgress(prev => ({ ...prev, [msg.fileId]: 100 }));

            setTimeout(() => {
              setDownloadProgress(prev => { const n = { ...prev }; delete n[msg.fileId]; return n; });
              delete inboundBuffersRef.current[msg.fileId];
            }, 2000);

            activeTransfers.current.delete(`${msg.fileId}-${id}`);
            console.log(`%c [Success] File ${buffer.name} received & Reconstructed!`, 'color: #00ff00');
          }, waitTime);
        }
      } catch (err) { console.error("File Msg Error", err); }
    } else {
      // BINARY CHUNK RECEIVE
      const entries = Object.entries(inboundBuffersRef.current);
      if (entries.length > 0) {
        // Giả định nhận file theo thứ tự request (hoặc file đang ở trạng thái receiving)
        const [fid, val] = entries.find(([_, v]) => v.status === 'receiving') || entries[0];
        val.chunks.push(e.data);
        val.receivedBytes += e.data.byteLength;

        // Gửi ACK để người gửi biết là mình vẫn đang sống và nhận tốt
        if (val.chunks.length % 10 === 0) {
          peer.fileChannel.send(JSON.stringify({ type: 'file:ack', fileId: fid }));
        }
      }
    }
  };

  const acceptFile = (peerId, fileId, name, size) => {
    const peer = peersRef.current[peerId];
    if (peer && peer.fileChannel.readyState === 'open') {
      const transferKey = `${fileId}-${peerId}`;
      activeTransfers.current.add(transferKey);

      const startTime = Date.now();
      inboundBuffersRef.current[fileId] = { name, size, chunks: [], receivedBytes: 0, status: 'receiving', startTime };
      peer.fileChannel.send(JSON.stringify({ type: "file:request", fileId }));
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: 'receiving' } : f));

      const interval = setInterval(() => {
        const buffer = inboundBuffersRef.current[fileId];
        if (!buffer || !activeTransfers.current.has(transferKey)) {
          clearInterval(interval);
          return;
        }

        const elapsed = Date.now() - startTime;
        const timeProgress = (elapsed / 6000) * 100;
        const realProgress = (buffer.receivedBytes / buffer.size) * 100;

        // Progress = Min của thời gian (6s) và dung lượng thực
        const p = Math.min(Math.round(timeProgress), Math.round(realProgress), 99);
        setDownloadProgress(prev => ({ ...prev, [fileId]: p }));
      }, 200);
      progressTimers.current[fileId] = interval;
    }
  };

  const sendFileInChunks = async (peer, file, fileId, toPeerId, transferKey) => {
    const CHUNK_SIZE = 16384; // 16KB chuẩn WebRTC
    let offset = 0;
    const startTime = Date.now();

    try {
      while (offset < file.size) {
        if (!activeTransfers.current.has(transferKey)) break;
        if (peer.fileChannel.readyState !== "open") break;

        // Kiểm tra Buffer (Backpressure)
        if (peer.fileChannel.bufferedAmount > 256000) {
          await new Promise(r => setTimeout(r, 50));
          continue;
        }

        const chunk = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        peer.fileChannel.send(buffer);

        offset += CHUNK_SIZE;

        const elapsed = Date.now() - startTime;
        const timeProgress = (elapsed / 6000) * 100;
        const realProgress = (offset / file.size) * 100;

        const p = Math.min(Math.round(timeProgress), Math.round(realProgress), 99);
        setUploadProgress(prev => ({ ...prev, [fileId]: p }));

        // Tránh block main thread
        if (offset % (CHUNK_SIZE * 20) === 0) {
          await new Promise(r => setTimeout(r, 1));
        }
      }

      const endElapsed = Date.now() - startTime;
      const waitTime = Math.max(0, 6000 - endElapsed);

      // Đợi cho đủ 6s mới báo xong
      setTimeout(() => {
        if (activeTransfers.current.has(transferKey) && peer.fileChannel.readyState === "open") {
          setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));
          peer.fileChannel.send(JSON.stringify({ type: 'file:complete', fileId }));

          // --- DEMO EVIDENCE: MEMORY CLEANUP ---
          console.log(`%c [Memory Cleanup] 🧹 File reference '${file.name}' released from outbound buffer. Progress 100%`, 'color: #ff9900; font-weight: bold;');
          // ------------------------------------

          setTimeout(() => {
            setUploadProgress(prev => { const n = { ...prev }; delete n[fileId]; return n; });
            delete outboundFilesRef.current[fileId]; // Xóa hẳn tham chiếu file
            activeTransfers.current.delete(transferKey);
          }, 2000);
        }
      }, waitTime);

    } catch (err) { console.error("Send Error:", err); }
  };

  const createPeer = useCallback((id, email, stream, initiator = false) => {
    const peer = new PeerService();
    if (stream) stream.getTracks().forEach(track => peer.peer.addTrack(track, stream));

    peer.peer.onicecandidate = (e) => e.candidate && socket.emit("peer:candidate", { candidate: e.candidate, to: id });
    peer.peer.ontrack = (event) => {
      setRemoteStreams(prev => prev.find(p => p.id === id) ? prev : [...prev, { id, email, stream: event.streams[0] }]);
    };

    if (initiator) {
      peer.chatChannel = peer.peer.createDataChannel("chat");
      peer.fileChannel = peer.peer.createDataChannel("file");

      peer.chatChannel.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          setMessages(prev => [...prev, { id: Date.now(), text: d.text, fromEmail: email, fromSelf: false, time: d.time }]);
        } catch (err) { }
      };
      setupFileLogic(peer, email, id);
    } else {
      peer.peer.ondatachannel = (event) => {
        const channel = event.channel;
        if (channel.label === "chat") {
          peer.chatChannel = channel;
          channel.onmessage = (e) => {
            try {
              const d = JSON.parse(e.data);
              setMessages(prev => [...prev, { id: Date.now(), text: d.text, fromEmail: email, fromSelf: false, time: d.time }]);
            } catch (err) { }
          };
        }
        if (channel.label === "file") {
          peer.fileChannel = channel;
          setupFileLogic(peer, email, id);
        }
      };
    }
    return peer;
  }, [socket]);

  useEffect(() => {
    // Xóa logic chặn reload cũ
    const handleBeforeUnload = () => socket.emit("user:leaving", { room: currentRoom });
    window.addEventListener("beforeunload", handleBeforeUnload);

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        setMyStream(stream);
        myStreamRef.current = stream;
      } catch (e) { console.warn("No Camera", e); }
      socket.emit("room:join", { email: myEmail, room: currentRoom });
    };
    init();

    return () => {
      socket.emit("user:leaving", { room: currentRoom });
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (myStreamRef.current) myStreamRef.current.getTracks().forEach(t => t.stop());
      Object.values(peersRef.current).forEach(p => p.peer.close());
    };
  }, []); // Vẫn giữ empty dep

  useEffect(() => {
    const handleJoined = async ({ email, id }) => {
      // 🔔 SYSTEM NOTIFICATION: JOIN (DEDUPLICATED)
      setMessages(prev => {
        const lastMsg = prev[prev.length - 1];
        // Nếu tin cuối cùng giống hệt và < 2s thì bỏ qua
        if (lastMsg && lastMsg.text === `${email} joined the room` && (Date.now() - lastMsg.id < 2000)) {
          return prev;
        }
        showToast(` 👋 ${email} joined the room`);
        return [...prev, { id: Date.now(), text: `${email} joined the room`, isSystem: true }];
      });

      const p = createPeer(id, email, myStreamRef.current, true);
      peersRef.current[id] = p;
      const offer = await p.getOffer();
      socket.emit("user:call", { to: id, offer });
    };
    const handleInCall = async ({ from, offer, fromEmail }) => {
      const p = createPeer(from, fromEmail, myStreamRef.current, false);
      peersRef.current[from] = p;
      const answer = await p.getAnswer(offer);
      socket.emit("call:accepted", { to: from, ans: answer });
    };
    const handleAccepted = async ({ from, ans }) => peersRef.current[from] && await peersRef.current[from].setLocalDescription(ans);
    const handleCandidate = async ({ candidate, from }) => { if (peersRef.current[from]) await peersRef.current[from].addIceCandidate(candidate); };

    const handleLeft = ({ id, email }) => {
      // 🔔 SYSTEM NOTIFICATION: LEAVE (DEDUPLICATED)
      if (email) {
        setMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          // Nếu tin cuối cùng giống hệt và < 2s thì bỏ qua
          if (lastMsg && lastMsg.text === `${email} left the room` && (Date.now() - lastMsg.id < 2000)) {
            return prev;
          }
          showToast(` 🚪 ${email} left the room`);
          return [...prev, { id: Date.now(), text: `${email} left the room`, isSystem: true }];
        });
      }

      setRemoteStreams(prev => prev.filter(s => s.id !== id));
      if (peersRef.current[id]) { peersRef.current[id].peer.close(); delete peersRef.current[id]; }
    };

    socket.on("user:joined", handleJoined);
    socket.on("incoming:call", handleInCall);
    socket.on("call:accepted", handleAccepted);
    socket.on("peer:candidate", handleCandidate);
    socket.on("user:left", handleLeft);
    return () => {
      socket.off("user:joined", handleJoined);
      socket.off("incoming:call", handleInCall);
      socket.off("call:accepted", handleAccepted);
      socket.off("peer:candidate", handleCandidate);
      socket.off("user:left", handleLeft);
    };
  }, [socket, createPeer]);

  const pStream = pinnedId === 'local' ? { stream: myStream, email: "You", id: 'local' } : remoteStreams.find(r => r.id === pinnedId);
  const otherStreams = [{ stream: myStream, email: "You", id: 'local' }, ...remoteStreams].filter(s => s.id !== pinnedId);

  // STYLE CHO HEADER MOBILE
  const headerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px'
  };

  const leaveBtnStyle = {
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    marginLeft: '10px',
    boxShadow: '0 2px 5px rgba(220, 53, 69, 0.4)'
  };

  return (
    <div className="room-container">
      <header className="room-header" style={{ padding: '10px' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Room: {currentRoom}</h1>
        {/* Responsive Header: Dùng flex-wrap để xuống dòng trên mobile */}
        <div className="connection-status" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
          <span>👤 {myEmail}</span>
          <span>|</span>
          <span>👥 {remoteStreams.length + 1}</span>
          <button className="btn-leave" onClick={handleLeaveRoom} style={leaveBtnStyle}>📞 Leave</button>
        </div>
      </header>
      <main className="main-content">
        <div className="video-section">
          <div className="controls-bar">
            <button className={`btn-control ${isScreenSharing ? 'active' : ''}`} onClick={handleScreenShare}>{isScreenSharing ? 'Stop Screen' : 'Screen'}</button>
            <button className={`btn-control ${isRecording ? 'active' : ''}`} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? 'Stop Record' : 'Record'}</button>
            <button className="btn-control" onClick={() => fileInputRef.current?.click()}>📁 File</button>
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
            <div className="status-progress-container">
              {Object.entries(uploadProgress).map(([fId, p]) => (
                <ProgressItem key={fId} name={files.find(f => f.id === fId)?.name || 'File'} progress={p} type="upload" status="uploading" onCancel={() => handleCancelFile(fId)} />
              ))}
              {Object.entries(downloadProgress).map(([fId, p]) => (
                <ProgressItem key={fId} name={files.find(f => f.id === fId)?.name || 'File'} progress={p} type="download" status="downloading" onCancel={() => handleCancelFile(fId)} />
              ))}
            </div>
          </div>
          <div className={`video-layout ${pinnedId ? 'spotlight' : 'grid'}`}>
            {pinnedId && pStream && <div className="pinned-video-container"><VideoPlayer stream={pStream.stream} isLocal={pStream.id === 'local'} email={pStream.email} id={pStream.id} onPin={handlePin} isPinned={true} /></div>}
            <div className={`side-videos-grid ${!pinnedId ? 'grid-only' : ''}`}>
              {otherStreams.map(s => <VideoPlayer key={s.id} stream={s.stream} isLocal={s.id === 'local'} email={s.email} id={s.id} onPin={handlePin} isPinned={false} />)}
            </div>
          </div>
        </div>
        <aside className="side-panel">
          <div className="chat-box">
            <div className="panel-header">💬 Chat</div>
            <div className="chat-messages">
              {messages.map(m => (
                m.isSystem ? (
                  <div key={m.id} className="system-msg" style={{ textAlign: 'center', fontSize: '0.8rem', color: '#888', fontStyle: 'italic', margin: '5px 0' }}>
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className={`chat-message ${m.fromSelf ? 'self' : 'other'}`}>
                    {!m.fromSelf && <small>{m.fromEmail}</small>}
                    <p>{m.text}</p>
                    <div className="message-time">{m.time}</div>
                  </div>
                )
              ))}
            </div>
            <div className="chat-input-wrapper"><input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Type..." /><button className="btn-send" onClick={handleSendMessage}>Send</button></div>
          </div>
          <div className="file-panel">
            <div className="panel-header">📂 P2P Files</div>
            <div className="file-list">{files.map(f => (
              <div key={f.id} className="file-item">
                <div className="file-info"><span className="file-name" title={f.name}>{f.name}</span> <span style={{ fontSize: '0.8rem', color: '#ccc' }}>({formatBytes(f.size)})</span> <small className={f.status === 'cancelled' ? 'status-cancelled' : ''}>{f.status}</small></div>
                {f.status === 'pending' && <button className="btn-send" onClick={() => acceptFile(f.peerId, f.id, f.name, f.size)}>Accept</button>}
                {f.status === 'completed' && f.url && <a href={f.url} download={f.name} className="dl-btn">💾 Save</a>}
              </div>
            ))}</div>
          </div>
        </aside>
      </main>

      {/* Toast Notifications Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast-notification">
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Room;