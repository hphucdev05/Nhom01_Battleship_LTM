# 🎥 WebRTC P2P Video Call & File Sharing

Dự án môn học: **Lập trình mạng**  
Nhóm thực hiện: **Nhóm 01**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![WebRTC](https://img.shields.io/badge/tech-WebRTC-orange.svg)
![Socket.IO](https://img.shields.io/badge/tech-Socket.IO-black.svg)
![React](https://img.shields.io/badge/frontend-React-blue.svg)

## 📖 Giới thiệu

Ứng dụng gọi video trực tuyến (Video Conference) dựa trên công nghệ **WebRTC** cho phép giao tiếp thời gian thực (Real-time Communication) theo mô hình **Peer-to-Peer (P2P)**.

Dự án hỗ trợ gọi video nhiều người, chat thời gian thực, chia sẻ màn hình và đặc biệt là **truyền tải file trực tiếp (P2P File Transfer)** không qua server trung gian, đảm bảo tốc độ cao và bảo mật riêng tư.

---

## 🚀 Tính năng chính

### 1. 📹 Video Call Multi-user
- Kết nối P2P mesh network
- Chất lượng HD, tự động điều chỉnh băng thông
- Bật/Tắt Camera & Mic

### 2. 🖥️ Screen Sharing (#9)
- Chia sẻ màn hình chất lượng cao
- Switch mượt mà giữa Camera và Màn hình

### 3. 📂 P2P File Transfer (#8, #11)
- Gửi file trực tiếp giữa các máy (Client-to-Client)
- Không giới hạn dung lượng (chỉ phụ thuộc RAM)
- **Memory Management (#14)**: Cơ chế Buffer thông minh
- Thanh tiến trình thực (Real-time Progress Bar)

### 4. ⏺️ Recording (#9)
- Ghi hình cuộc gọi và tải về máy (Local Recording)
- Hỗ trợ định dạng `.webm`

### 5. 💬 Real-time Chat (#6)
- Chat qua DataChannel (P2P) độ trễ cực thấp
- Thông báo Toast khi có người Join/Leave (#10)

### 6. 🌐 Connectivity (#13)
- Hỗ trợ **TURN Server (OpenRelay)** giúp kết nối xuyên tường lửa/NAT
- ICE Candidate Buffering fix lỗi kết nối kém

---

## 🛠️ Công nghệ sử dụng

| Thành phần | Công nghệ | Mục đích |
|------------|-----------|----------|
| **Frontend** | React.js | Giao diện người dùng (SPA) |
| **Styling** | Room.css (Vanilla) | Custom UI/UX, Glassmorphism |
| **Real-time** | WebRTC | Media Stream, Data Channel |
| **Signaling** | Socket.IO | Bắt tay kết nối (Handshake) |
| **Backend** | Node.js / Express | Signaling Server |

---

## ⚙️ Hướng dẫn cài đặt

### 1. Clone dự án
```bash
git clone https://github.com/hphucdev05/Nhom01_LTM.git
cd Nhom01_LTM
```

### 2. Cài đặt Dependencies

**Server:**
```bash
cd server
npm install
```

**Client:**
```bash
cd client
npm install socket.io-client react-router-dom
```

### 3. Chạy ứng dụng

Bạn cần mở 2 terminal riêng biệt:

**Terminal 1 (Server):**
```bash
cd server
npm start
# Server chạy tại port 8000
```

**Terminal 2 (Client):**
```bash
cd client
npm start
# Client chạy tại port 3000
```

---

## 📂 Cấu trúc dự án

```
Nhom01_LTM/
├── server/                 # Backend Signaling
│   └── index.js           # Socket.IO Logic (#1, #12)
├── client/                 # Frontend React
│   └── src/
│       ├── context/
│       │   └── SocketProvider.jsx  # Socket Context (#5)
│       ├── screens/
│       │   ├── Lobby.jsx  # Màn hình chờ (#2)
│       │   ├── Room.jsx   # Màn hình gọi chính (All features)
│       │   └── Room.css   # Styling (#7, #10, #11)
│       └── service/
│           └── Peer.js    # WebRTC Core (#3, #13)
└── README.md              # Documentation (#15)
```

---

## 👥 Thành viên nhóm

| STT | Thành viên | Vai trò | Đóng góp chính |
|-----|------------|---------|----------------|
| 1 | **Tui (Bạn)** | Backend Lead | Signaling Server (#1, #4), Optimization (#12) |
| 2 | **Ý** | WebRTC Core | PeerService (#3), TURN/ICE (#13), Screen Share (#9) |
| 3 | **Quân** | Data Specialist | Chat (#6), File Transfer (#8), Progress (#11), Memory (#14) |
| 4 | **An** | UI/UX | Lobby (#2), Room UI (#7), Toasts (#10), Docs (#15) |

---

> **Lưu ý:** Để test tính năng gửi file P2P, hãy mở 2 trình duyệt ẩn danh hoặc 2 máy khác nhau. Mở F12 để xem Memory Logs chứng minh P2P.
