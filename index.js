const { Server } = require("socket.io");
const http = require("http");

const PORT = process.env.PORT || 8000;

// Tạo HTTP Server để Render có thể "kiểm tra sức khỏe" (Health Check)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebRTC Signaling Server is Running\n');
});

const io = new Server(server, {
  cors: {
    origin: "*", // Cho phép mọi nguồn trong môi trường deploy
    methods: ["GET", "POST"],
    credentials: true
  },
});

server.listen(PORT, () => {
  console.log(`🚀 Production Server ready on port ${PORT}`);
});

const emailToSocketIdMap = new Map();
const socketIdToEmailMap = new Map();
const socketIdToRoomMap = new Map(); // Track which room each socket is in

io.on("connection", (socket) => {
  console.log(`✅ Socket Connected: ${socket.id}`);

  socket.on("room:join", (data) => {
    const { email, room } = data;

    // Xử lý nạp dữ liệu mượt mà khi refresh (Tránh Ghost Users)
    const oldSocketId = emailToSocketIdMap.get(email);
    if (oldSocketId && oldSocketId !== socket.id) {
      console.log(`🔄 Force cleaning ghost user: ${email} (${oldSocketId})`);
      const oldRoom = socketIdToRoomMap.get(oldSocketId);
      if (oldRoom) {
        // Thông báo cho MỌI NGƯỜI trong phòng xóa User cũ này ngay lập tức
        io.to(oldRoom).emit("user:left", { id: oldSocketId, email });
      }
      socketIdToEmailMap.delete(oldSocketId);
      socketIdToRoomMap.delete(oldSocketId);
    }

    // Cập nhật mapping mới
    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);
    socketIdToRoomMap.set(socket.id, room);

    // Check if socket is already in another room
    const currentRoom = socketIdToRoomMap.get(socket.id);
    if (currentRoom && currentRoom !== room) {
      console.log(`📤 Socket ${socket.id} leaving old room: ${currentRoom}`);
      socket.leave(currentRoom);

      // Notify old room
      io.to(currentRoom).emit("user:left", {
        id: socket.id,
        email: socketIdToEmailMap.get(socket.id)
      });
    }

    // Update mappings
    emailToSocketIdMap.set(email, socket.id);
    socketIdToEmailMap.set(socket.id, email);
    socketIdToRoomMap.set(socket.id, room);

    // Join room
    socket.join(room);

    // Get existing users in room (excluding self)
    const clientsInRoom = io.sockets.adapter.rooms.get(room);
    const existingUsers = [];

    if (clientsInRoom) {
      clientsInRoom.forEach(id => {
        if (id !== socket.id) {
          existingUsers.push({
            id: id,
            email: socketIdToEmailMap.get(id)
          });
        }
      });
    }

    console.log(`👤 ${email} joined room ${room}. Existing: ${existingUsers.length}`);

    // Send existing users to new joiner
    socket.emit("room:joined", { email, room, existingUsers });

    // Notify others about new joiner (with user count update)
    const totalUsers = clientsInRoom ? clientsInRoom.size : 1;
    socket.to(room).emit("user:joined", {
      email,
      id: socket.id,
      totalUsers
    });

    // Broadcast updated user count to everyone including self
    io.to(room).emit("room:update", {
      totalUsers,
      users: Array.from(clientsInRoom || []).map(id => ({
        id,
        email: socketIdToEmailMap.get(id)
      }))
    });
  });

  // Handle explicit leave
  socket.on("user:leaving", ({ room }) => {
    if (!room) return;

    const email = socketIdToEmailMap.get(socket.id);
    console.log(`👋 ${email} leaving room ${room}`);

    socket.leave(room);

    // Notify others
    const clientsInRoom = io.sockets.adapter.rooms.get(room);
    const totalUsers = clientsInRoom ? clientsInRoom.size : 0;

    io.to(room).emit("user:left", {
      id: socket.id,
      email,
      totalUsers
    });

    // Broadcast updated user count
    io.to(room).emit("room:update", {
      totalUsers,
      users: Array.from(clientsInRoom || []).map(id => ({
        id,
        email: socketIdToEmailMap.get(id)
      }))
    });

    // Clean up mappings
    socketIdToRoomMap.delete(socket.id);
  });

  // Signaling events
  socket.on("user:call", ({ to, offer }) => {
    const fromEmail = socketIdToEmailMap.get(socket.id);
    io.to(to).emit("incoming:call", { from: socket.id, offer, fromEmail });
  });

  socket.on("call:accepted", ({ to, ans }) => {
    io.to(to).emit("call:accepted", { from: socket.id, ans });
  });

  socket.on("peer:nego:needed", ({ to, offer }) => {
    io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
  });

  socket.on("peer:nego:done", ({ to, ans }) => {
    io.to(to).emit("peer:nego:final", { from: socket.id, ans });
  });

  socket.on("peer:candidate", ({ to, candidate }) => {
    io.to(to).emit("peer:candidate", { from: socket.id, candidate });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const email = socketIdToEmailMap.get(socket.id);
    const room = socketIdToRoomMap.get(socket.id);

    console.log(`❌ ${email} (${socket.id}) disconnected`);

    if (room) {
      // Notify others in the room
      const clientsInRoom = io.sockets.adapter.rooms.get(room);
      const totalUsers = clientsInRoom ? clientsInRoom.size : 0;

      io.to(room).emit("user:left", {
        id: socket.id,
        email,
        totalUsers
      });

      // Broadcast updated user count
      io.to(room).emit("room:update", {
        totalUsers,
        users: Array.from(clientsInRoom || []).map(id => ({
          id,
          email: socketIdToEmailMap.get(id)
        }))
      });
    }

    // Clean up all mappings
    if (email) emailToSocketIdMap.delete(email);
    socketIdToEmailMap.delete(socket.id);
    socketIdToRoomMap.delete(socket.id);
  });
});

console.log("🚀 Server running on port 8000");
console.log("📡 Accessible at:");
console.log("   - http://localhost:8000");

// Get local IP
const os = require('os');
const networkInterfaces = os.networkInterfaces();
Object.keys(networkInterfaces).forEach(interfaceName => {
  networkInterfaces[interfaceName].forEach(iface => {
    if (iface.family === 'IPv4' && !iface.internal) {
      console.log(`   - http://${iface.address}:8000`);
    }
  });
});
