const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'hostel.db');
const db = new Database(dbPath);

// Initialize database with all schema creation in a single synchronous transaction
try {
  // Step 1: Set pragmas and create base schema
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'manager', 'admin')),
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS hostels (
      id TEXT PRIMARY KEY,
      manager_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      price_per_month REAL NOT NULL,
      latitude REAL,
      longitude REAL,
      amenities TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      hostel_id TEXT NOT NULL,
      room_number TEXT NOT NULL,
      room_type TEXT NOT NULL CHECK(room_type IN ('single', 'double', 'triple', 'dormitory')),
      capacity INTEGER NOT NULL DEFAULT 1,
      price_per_month REAL NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      hostel_id TEXT,
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      hostel_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (hostel_id) REFERENCES hostels(id) ON DELETE CASCADE
    );
  `);

  // Step 2: Check if migration is needed
  const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
  const schema = stmt.get();
  stmt.finalize();
  
  if (schema && schema.sql && !schema.sql.includes("'admin'")) {
    // Migrate to support admin role
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS users_new;
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('student', 'manager', 'admin')),
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_new SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      PRAGMA foreign_keys = ON;
    `);
    console.log('Migrated users table to allow admin role');
  }

  // Step 3: Seed default admin if none exists
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hostelhub.com';
  const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
  const existing = checkStmt.get([adminEmail]);
  checkStmt.finalize();
  
  if (!existing) {
    const hashed = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
    const id = uuidv4();
    const insertStmt = db.prepare(
      'INSERT INTO users (id, name, email, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertStmt.run([id, 'System Administrator', adminEmail, hashed, 'admin', null]);
    insertStmt.finalize();
    console.log(`Seeded default admin: ${adminEmail}`);
  }

  console.log('Database initialized successfully');
} catch (error) {
  console.error('Database initialization failed:', error);
  throw error;
}

// node-sqlite3-wasm's db.prepare() returns a Statement with .get(), .all(), .run(), .finalize()
// matching better-sqlite3's interface — no shim needed.
// The only difference: params must be passed as an array, not spread args.
// We wrap prepare() so callers can pass spread args just like better-sqlite3.
const _nativePrepare = db.prepare.bind(db);

db.prepare = function(sql) {
  const stmt = _nativePrepare(sql);
  return {
    get(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      try { return stmt.get(params); } finally { stmt.finalize(); }
    },
    all(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      try { return stmt.all(params) || []; } finally { stmt.finalize(); }
    },
    run(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      try { stmt.run(params); } finally { stmt.finalize(); }
    },
  };
};

console.log('Database initialised successfully');

module.exports = db;
