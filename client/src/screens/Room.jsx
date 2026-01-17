import React, { useEffect, useRef, useState } from "react";
import "./Room.css";
import PeerService from "../services/Peer";

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
      setMessages((prev) => [
        ...prev,
        { from: "remote", text: event.data },
      ]);
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

  return (
    <div className="room-container">
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
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default Room;
