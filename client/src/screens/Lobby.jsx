import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketProvider";
import "./Lobby.css";

const Lobby = () => {
  const socket = useSocket();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");

  const handleJoin = useCallback(() => {
    if (!email || !roomId) {
      alert("Vui lòng nhập đầy đủ Email và Room ID");
      return;
    }

    socket.emit("room:join", { email, room: roomId });
  }, [email, roomId, socket]);

  const handleJoinRoom = useCallback((data) => {
    const { room } = data;
    navigate(`/room/${room}`);
  }, [navigate]);

  useEffect(() => {
    socket.on("room:joined", handleJoinRoom);
    return () => {
      socket.off("room:joined", handleJoinRoom);
    };
  }, [socket, handleJoinRoom]);

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h2>WebRTC Meeting Room</h2>

        <input
          type="email"
          placeholder="Nhập Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="text"
          placeholder="Nhập Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />

        <button onClick={handleJoin}>Tham gia phòng</button>
      </div>
    </div>
  );
};

export default Lobby;
