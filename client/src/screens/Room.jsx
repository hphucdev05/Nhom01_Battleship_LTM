import React, { useEffect, useRef, useState, useCallback } from "react";
import "./Room.css";
import PeerService from "../service/Peer";

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

  // 🖥️ Screen Share & Recording
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // 🔔 Toast Notifications (#10)
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);


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

  // 🖥️ SCREEN SHARE
  const handleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });

        // Thay thế video track hiện tại bằng screen track
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = PeerService.peer
          .getSenders()
          .find((s) => s.track?.kind === "video");

        if (sender) {
          sender.replaceTrack(videoTrack);
        }

        // Cập nhật local stream
        setLocalStream(screenStream);
        localVideoRef.current.srcObject = screenStream;
        setIsScreenSharing(true);

        // Khi user dừng share từ browser
        videoTrack.onended = () => {
          handleStopScreenShare();
        };
      } catch (error) {
        console.error("Screen share error:", error);
      }
    } else {
      handleStopScreenShare();
    }
  }, [isScreenSharing]);

  const handleStopScreenShare = useCallback(async () => {
    try {
      // Lấy lại camera stream
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const videoTrack = cameraStream.getVideoTracks()[0];
      const sender = PeerService.peer
        .getSenders()
        .find((s) => s.track?.kind === "video");

      if (sender) {
        sender.replaceTrack(videoTrack);
      }

      setLocalStream(cameraStream);
      localVideoRef.current.srcObject = cameraStream;
      setIsScreenSharing(false);
    } catch (error) {
      console.error("Stop screen share error:", error);
    }
  }, []);

  // ⏺️ RECORDING
  const startRecording = useCallback(() => {
    if (!localStream) return;

    try {
      const options = { mimeType: "video/webm;codecs=vp9" };
      const recorder = new MediaRecorder(localStream, options);
      const chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      console.log("🔴 Recording started");
    } catch (error) {
      console.error("Recording error:", error);
    }
  }, [localStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      setIsRecording(false);
      console.log("⏹️ Recording stopped");
    }
  }, [mediaRecorder]);


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
        <button onClick={handleScreenShare}>
          {isScreenSharing ? "🖥️ Stop Share" : "🖥️ Share Screen"}
        </button>
        <button onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? "⏹️ Stop Rec" : "⏺️ Record"}
        </button>
        <button>Leave</button>
      </div>

      {/* 🔔 Toast Notifications (#10) */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>

    </div>
  );
};

export default Room;
