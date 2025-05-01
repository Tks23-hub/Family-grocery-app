const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");
const app = express();
const PORT = process.env.PORT || 3000;

dotenv.config();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const dbPath =
  process.env.NODE_ENV === "production" ? "/tmp/grocery.db" : "./db/grocery.db";
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("❌ DB error:", err);
  else console.log("✅ Connected to SQLite DB.");
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS grocery_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    items TEXT,
    sent_time TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS status_updates (
    list_id INTEGER,
    received_by TEXT,
    received_time TEXT,
    done_by TEXT,
    done_time TEXT,
    FOREIGN KEY(list_id) REFERENCES grocery_lists(id)
  )`);
});

const userEnv = process.env.USERS;
const users = {};
if (userEnv) {
  userEnv.split(",").forEach((entry) => {
    const [name, pass] = entry.split(":");
    users[name.trim()] = pass.trim();
  });
}

function nowIST() {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

app.post("/submit", (req, res) => {
  const { name, password, items } = req.body;

  if (!users[name] || users[name] !== password)
    return res.status(401).json({ error: "Invalid name or password" });

  const sent_time = nowIST().toISOString();

  db.run(
    "INSERT INTO grocery_lists (sender, items, sent_time) VALUES (?, ?, ?)",
    [name, items, sent_time],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error (submit)" });
      res.json({ message: "List submitted", listId: this.lastID });
    }
  );
});

app.post("/receive", (req, res) => {
  const { name, password, listId } = req.body;

  if (!users[name] || users[name] !== password)
    return res.status(401).json({ error: "Invalid name or password" });

  const received_time = nowIST().toISOString();

  db.run(
    `INSERT OR REPLACE INTO status_updates (list_id, received_by, received_time)
     VALUES (?, ?, ?)`,
    [listId, name, received_time],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error (receive)" });
      res.json({ message: "Marked as received" });
    }
  );
});

app.post("/done", (req, res) => {
  const { name, password, listId } = req.body;

  if (!users[name] || users[name] !== password)
    return res.status(401).json({ error: "Invalid name or password" });

  const done_time = nowIST().toISOString();

  db.run(
    `UPDATE status_updates SET done_by = ?, done_time = ? WHERE list_id = ?`,
    [name, done_time, listId],
    (err) => {
      if (err) return res.status(500).json({ error: "DB error (done)" });
      res.json({ message: "Marked as done" });
    }
  );
});

app.get("/latest", (req, res) => {
  db.get(
    `SELECT l.*, s.received_by, s.received_time, s.done_by, s.done_time
     FROM grocery_lists l
     LEFT JOIN status_updates s ON l.id = s.list_id
     ORDER BY l.id DESC LIMIT 1`,
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error (latest)" });
      res.json(row || {});
    }
  );
});

app.get("/history", (req, res) => {
  db.all(
    `SELECT l.*, s.received_by, s.received_time, s.done_by, s.done_time
     FROM grocery_lists l
     LEFT JOIN status_updates s ON l.id = s.list_id
     ORDER BY l.id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error (history)" });
      res.json(rows);
    }
  );
});

app.listen(PORT, () =>
  console.log(`🚀 Grocery Tracker server running at http://localhost:${PORT}`)
);
