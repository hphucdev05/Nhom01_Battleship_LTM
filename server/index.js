const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 8000;

// HTTP server (for Render health check)
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebRTC Signaling Server is Running\n");
});

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Base socket connection
io.on("connection", (socket) => {
  console.log("🔌 New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
});
