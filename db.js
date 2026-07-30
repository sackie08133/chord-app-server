import Database from 'better-sqlite3'
const db = new Database('database.db')

db.pragma(`journal_mode = WAL`)

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
// song id / user id, which song/user does this belong to

db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    instrument TEXT NOT NULL,
    row INTEGER NOT NULL,
    column INTEGER NOT NULL,
    octave INTEGER NOT NULL,
    FOREIGN KEY(song_id) references songs(id)
    UNIQUE (song_id, instrument, row, column, octave)
    )`)

db.exec(`
  CREATE TABLE IF NOT EXISTS drum_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    FOREIGN KEY(song_id) REFERENCES songs(id)
  )
`);


db.exec(`
    CREATE TABLE IF NOT EXISTS drum (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drum_id INTEGER NOT NULL,
        drum_type TEXT NOT NULL,
        col INTEGER NOT NULL,
        FOREIGN KEY(drum_id) references drum_tracks(id),
        UNIQUE (drum_id, drum_type, col)
    )`)


export default db