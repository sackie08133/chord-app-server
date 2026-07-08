import Database from 'better-sqlite3'
const db = new Database('db.js')

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`)

db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        last_edited TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`)

export default db