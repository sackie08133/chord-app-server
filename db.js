import pg from "pg";
import fs from "fs";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    
  },
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});


async function initializeDatabase() {
  await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            bpm INTEGER NOT NULL,
            last_edited TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS guitar_tracks (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            instrument TEXT NOT NULL,
            song_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            track_id INTEGER NOT NULL,
            "row" TEXT NOT NULL,
            col INTEGER NOT NULL,
            octave INTEGER NOT NULL,
            FOREIGN KEY (track_id) REFERENCES guitar_tracks(id) ON DELETE CASCADE,
            UNIQUE (track_id, "row", col)
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS drum_tracks (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            song_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS drum (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            drum_id INTEGER NOT NULL,
            drum_type TEXT NOT NULL,
            col INTEGER NOT NULL,
            FOREIGN KEY (drum_id) REFERENCES drum_tracks(id) ON DELETE CASCADE,
            UNIQUE (drum_id, drum_type, col)
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS rhythm_tracks (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            song_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            chord_slots TEXT NOT NULL,
            strum_pattern TEXT NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )
    `);

  await pool.query(`
        CREATE TABLE IF NOT EXISTS automation (
            id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            song_id INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            track_type TEXT NOT NULL,
            name TEXT NOT NULL,
            col INTEGER NOT NULL,
            FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        )
    `);

  console.log("PostgreSQL database initialized");
}

await initializeDatabase();
export default pool;
