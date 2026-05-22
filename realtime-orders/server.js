"use strict";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Client } = require("pg");
const path = require("path");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(express.static(path.join(__dirname, "client")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function createListenClient(attempt = 0) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
  });

  client.on("error", (err) => {
    console.error("Client error:", err.message);
  });

  client.on("end", () => {
    console.warn("Connection ended. Scheduling reconnect...");
    scheduleReconnect(attempt + 1);
  });

  try {
    await client.connect();
    console.log(`Connected (attempt ${attempt})`);

    await client.query("LISTEN orders_changed");
    console.log("LISTEN orders_changed registered");

    attempt = 0;

    client.on("notification", (msg) => {
      if (msg.channel !== "orders_changed") return;

      let payload;
      try {
        payload = JSON.parse(msg.payload);
      } catch (parseErr) {
        console.error("Failed to parse notification payload:", msg.payload);
        return;
      }

      console.log(`Notification received: ${payload.operation}`);
      io.emit("order_update", payload);
    });

    return client;
  } catch (connErr) {
    console.error(`Connection attempt ${attempt} failed:`, connErr.message);
    scheduleReconnect(attempt + 1);
    return null;
  }
}

function scheduleReconnect(attempt) {
  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt - 1), BACKOFF_MAX_MS);
  console.log(`Reconnecting in ${delay / 1000}s (attempt ${attempt})...`);
  setTimeout(() => createListenClient(attempt), delay);
}

io.on("connection", async (socket) => {
  console.log(`Client connected: ${socket.id}`);

  const queryClient = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await queryClient.connect();
    const result = await queryClient.query(
      "SELECT * FROM orders ORDER BY updated_at DESC LIMIT 100"
    );
    socket.emit("snapshot", result.rows);
    console.log(`Snapshot sent to ${socket.id}: ${result.rows.length} orders`);
  } catch (err) {
    console.error(`Failed to fetch snapshot for ${socket.id}:`, err.message);
    socket.emit("snapshot", []);
  } finally {
    await queryClient.end();
  }

  socket.on("disconnect", (reason) => {
    console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

let listenClient = null;

async function gracefulShutdown(signal) {
  console.log(`${signal} received: closing server gracefully`);
  httpServer.close(() => console.log('Server closed'));
  io.close(() => console.log('Socket.io closed'));
  if (listenClient) await listenClient.end();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

(async () => {
  listenClient = await createListenClient(0);

  httpServer.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
})();
