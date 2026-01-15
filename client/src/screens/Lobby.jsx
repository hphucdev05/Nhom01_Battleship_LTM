import { useState } from "react";
import "./Lobby.css";

const Lobby = () => {
  const [email, setEmail] = useState("");
  const [roomId, setRoomId] = useState("");

  const handleJoin = () => {
    if (!email || !roomId) {
      alert("Vui lòng nhập đầy đủ Email và Room ID");
      return;
    }

    console.log("Join room with:", { email, roomId });
    // NOTE: logic socket sẽ làm ở commit sau
  };

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
