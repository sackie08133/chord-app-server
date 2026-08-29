import Database from "better-sqlite3";
const db = new Database("database.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL
    )`);

db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        last_edited TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
// song id / user id, which song/user does this belong to

db.exec(`
    CREATE TABLE IF NOT EXISTS guitar_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument TEXT NOT NULL,
        song_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        row TEXT NOT NULL,
        col INTEGER NOT NULL,
        octave INTEGER NOT NULL,
        FOREIGN KEY(track_id) references guitar_tracks(id) ON DELETE CASCADE,
        UNIQUE (row, col)
    )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS drum_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
  )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS drum (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drum_id INTEGER NOT NULL,
        drum_type TEXT NOT NULL,
        col INTEGER NOT NULL,
        FOREIGN KEY(drum_id) references drum_tracks(track_id) ON DELETE CASCADE,
        UNIQUE (drum_id, drum_type, col)
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS rhythm_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        chord_slots TEXT NOT NULL,
        strum_pattern TEXT NOT NULL,
        FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS automation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        track_type TEXT NOT NULL,
        name TEXT NOT NULL,
        col INTEGER NOT NULL,
        FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    )
`)

export default db;
