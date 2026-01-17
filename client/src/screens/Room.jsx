import React from "react";
import "./Room.css";

const Room = () => {
  return (
    <div className="room-container">
      <div className="video-area">
        <div className="video-box">Local Video</div>
        <div className="video-box">Remote Video</div>
      </div>

      <div className="sidebar">
        <h3>Chat</h3>
        <div className="chat-box">
          <p className="system-msg">User joined the room</p>
        </div>

        <input
          type="text"
          placeholder="Type a message..."
          className="chat-input"
        />
      </div>

      <div className="control-bar">
        <button>🎤</button>
        <button>🎥</button>
        <button className="leave-btn">Leave</button>
      </div>
    </div>
  );
};
import { useEffect, useRef, useState } from "react";
import PeerService from "../services/Peer";

const Room = () => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // 1️⃣ LẤY CAMERA + MIC
  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // add track vào PeerConnection
        stream.getTracks().forEach((track) => {
          PeerService.peer.addTrack(track, stream);
        });
      } catch (err) {
        console.error("Error accessing media devices", err);
      }
    };

    getMedia();
  }, []);

  // 2️⃣ NHẬN REMOTE STREAM
  useEffect(() => {
    PeerService.peer.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStream(stream);

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    };
  }, []);

  return (
    <div style={{ display: "flex", gap: "20px" }}>
      <div>
        <h4>Local Video</h4>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{ width: "300px", background: "#000" }}
        />
      </div>

      <div>
        <h4>Remote Video</h4>
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: "300px", background: "#000" }}
        />
      </div>
    </div>
  );
};

export default Room;


export default Room;
