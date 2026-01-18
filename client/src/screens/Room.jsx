import React, { useEffect, useRef, useState } from "react";
import "./Room.css";
import PeerService from "../services/Peer";

// 📁 File Transfer
const CHUNK_SIZE = 16 * 1024; // 16KB
const incomingFileRef = useRef({
  metadata: null,
  chunks: [],
});


const Room = () => {
  // 🎥 Video refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // 💬 Chat DataChannel
  const chatChannelRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");

  // 🎬 Streams
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // 1️⃣ LẤY CAMERA + MIC
  useEffect(() => {
    const getMedia = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(stream);
      localVideoRef.current.srcObject = stream;

      stream.getTracks().forEach((track) => {
        PeerService.peer.addTrack(track, stream);
      });
    };

    getMedia();
  }, []);

  // 2️⃣ NHẬN REMOTE STREAM
  useEffect(() => {
    PeerService.peer.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStream(stream);
      remoteVideoRef.current.srcObject = stream;
    };

    // 🔹 NHẬN DATA CHANNEL (RECEIVER)
    PeerService.peer.ondatachannel = (event) => {
      const channel = event.channel;

      channel.onopen = () => {
        console.log("💬 Chat channel connected");
      };

      channel.onmessage = (event) => {
        setMessages((prev) => [
          ...prev,
          { from: "remote", text: event.data },
        ]);
      };

      chatChannelRef.current = channel;
    };
  }, []);

  // 🔹 TẠO DATA CHANNEL (CALLER)
  const setupChatChannel = () => {
    const channel = PeerService.peer.createDataChannel("chat");

    channel.onopen = () => {
      console.log("💬 Chat channel opened");
    };

   channel.onmessage = (event) => {
  // 📄 Nhận metadata file
  if (typeof event.data === "string") {
    const data = JSON.parse(event.data);

    if (data.type === "file-meta") {
      incomingFileRef.current.metadata = data;
      incomingFileRef.current.chunks = [];
      console.log("📥 Receiving file:", data.fileName);
      return;
    }

    // 💬 Chat message
    setMessages((prev) => [
      ...prev,
      { from: "remote", text: data.text || event.data },
    ]);
    return;
  }

  // 📦 Nhận chunk nhị phân
  incomingFileRef.current.chunks.push(event.data);

  const { metadata, chunks } = incomingFileRef.current;

  const receivedSize = chunks.reduce(
    (acc, chunk) => acc + chunk.byteLength,
    0
  );

  if (receivedSize >= metadata.fileSize) {
    const blob = new Blob(chunks);
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = metadata.fileName;
    a.click();

    console.log("✅ File reconstructed in RAM");

    incomingFileRef.current = { metadata: null, chunks: [] };
  }
};


    chatChannelRef.current = channel;
  };

  // 📌 GỌI HÀM NÀY KHI BÊN NÀY LÀ CALLER
  // setupChatChannel();

  // 💬 GỬI TIN NHẮN
  const handleSendMessage = () => {
    if (!messageInput || !chatChannelRef.current) return;

    chatChannelRef.current.send(messageInput);

    setMessages((prev) => [...prev, { from: "me", text: messageInput }]);
    setMessageInput("");
  };

  const handleFileSelect = async (e) => {
  const file = e.target.files[0];
  if (!file || !chatChannelRef.current) return;

  // 📄 Gửi metadata trước
  chatChannelRef.current.send(
    JSON.stringify({
      type: "file-meta",
      fileName: file.name,
      fileSize: file.size,
    })
  );

  let offset = 0;

  while (offset < file.size) {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    chatChannelRef.current.send(buffer);
    offset += CHUNK_SIZE;
  }

  console.log("📤 File sent:", file.name);
};


  return (
  <div className="room-container">

    <div className="main-content">
      {/* 🎥 VIDEO */}
      <div className="video-area">
        <video ref={localVideoRef} autoPlay muted playsInline />
        <video ref={remoteVideoRef} autoPlay playsInline />
      </div>

      {/* 💬 CHAT */}
      <div className="sidebar">
        <h3>Chat</h3>

        <div className="chat-box">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={msg.from === "me" ? "msg-me" : "msg-remote"}
            >
              {msg.text}
            </div>
          ))}
        </div>

        <div className="chat-input">
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
          />
          <button>Send</button>
        </div>

        <input
  type="file"
  onChange={handleFileSelect}
  style={{ marginTop: "10px" }}
/>

      </div>
    </div>

    {/* 🎛 CONTROL BAR */}
    <div className="control-bar">
      <button>Call</button>
      <button>Mute</button>
      <button>Leave</button>
    </div>

  </div>
};

export default Room;
