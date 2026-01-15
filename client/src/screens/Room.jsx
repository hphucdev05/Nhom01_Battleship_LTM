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

export default Room;
