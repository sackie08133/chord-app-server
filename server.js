import express from "express";
import cors from "cors";
import db from "./db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "dotenv/config";

const app = express();

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      message: "Authorization Declined",
    });
  }

  const token = auth.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Authorization Declined",
    });
  }

  try {
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decodedPayload.id;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token invalid or expired",
    });
  }
}

async function getOwnedSong(song_id, req, res) {
  const result = await db.query(`SELECT * FROM songs WHERE id = $1`, [song_id]);

  const song = result.rows[0];

  if (!song) {
    res.status(404).json({
      message: "song not found",
    });

    return null;
  }

  if (req.userId !== song.user_id) {
    res.status(403).json({
      message: "you do not own this song",
    });

    return null;
  }

  return song;
}

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: "username and password are required",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      `
            INSERT INTO users (username, password)
            VALUES ($1, $2)
            `,
      [username, hashedPassword],
    );

    res.status(201).json({
      message: "User Created",
    });
  } catch (error) {
    console.error("Signup error:", error);

    if (error.code === "23505") {
      return res.status(400).json({
        message: "Username is already taken",
      });
    }

    res.status(500).json({
      message: "Error thrown",
    });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query(`SELECT * FROM users WHERE username = $1`, [
      username,
    ]);

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        message: "username or password incorrect",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(400).json({
        message: "username or password incorrect",
      });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({ token });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Login failed",
    });
  }
});

app.post("/create", requireAuth, async (req, res) => {
  const { title, bpm } = req.body;
  const lastEdited = new Date().toISOString();
  const userId = req.userId;

  try {
    await db.query(
      `
            INSERT INTO songs
                (title, bpm, last_edited, user_id)
            VALUES
                ($1, $2, $3, $4)
            `,
      [title, bpm, lastEdited, userId],
    );

    res.status(201).json({
      message: "song created",
    });
  } catch (error) {
    console.error("Create song error:", error);

    res.status(500).json({
      message: "error",
    });
  }
});

app.post("/delete", requireAuth, async (req, res) => {
  const songToDelete = req.body.id;

  try {
    const song = await getOwnedSong(songToDelete, req, res);

    if (!song) return;

    await db.query(`DELETE FROM songs WHERE id = $1`, [songToDelete]);

    res.status(200).json({
      message: "song deleted",
    });
  } catch (error) {
    console.error("Delete song error:", error);

    res.status(500).json({
      message: "error",
    });
  }
});

app.get("/songs", requireAuth, async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM songs WHERE user_id = $1`, [
      req.userId,
    ]);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get songs error:", error);

    res.status(500).json({
      message: "error",
    });
  }
});

app.put("/songs/:id", requireAuth, async (req, res) => {
  const songId = req.params.id;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const { title, bpm } = req.body;
    const timeEdited = new Date().toISOString();

    await db.query(
      `
            UPDATE songs
            SET title = $1,
                bpm = $2,
                last_edited = $3
            WHERE id = $4
            `,
      [title, bpm, timeEdited, songId],
    );

    res.status(200).json({
      message: "change applied",
    });
  } catch (error) {
    console.error("Update song error:", error);

    res.status(500).json({
      message: "update failed",
    });
  }
});

app.get("/songs/:id", requireAuth, async (req, res) => {
  const songId = req.params.id;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    res.status(200).json(song);
  } catch (error) {
    console.error("Get song error:", error);

    res.status(500).json({
      message: "error",
    });
  }
});

app.post("/guitar-tracks", requireAuth, async (req, res) => {
  const { song_id, track_name, guitar_notes, instrument } = req.body;

  try {
    const song = await getOwnedSong(song_id, req, res);

    if (!song) return;

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const trackResult = await client.query(
        `
                INSERT INTO guitar_tracks
                    (song_id, instrument, name)
                VALUES
                    ($1, $2, $3)
                RETURNING id
                `,
        [song_id, instrument, track_name],
      );

      const newTrackId = trackResult.rows[0].id;

      for (const note of guitar_notes) {
        await client.query(
          `
                    INSERT INTO notes
                        ("track_id", "row", col, octave)
                    VALUES
                        ($1, $2, $3, $4)
                    `,
          [newTrackId, note.row, note.col, note.octave],
        );
      }

      await client.query("COMMIT");

      res.status(200).json({
        message: "Track Saved",
        track_id: newTrackId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("guitar-tracks error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/delete/guitar-tracks", requireAuth, async (req, res) => {
  const { trackId } = req.body;

  try {
    const trackResult = await db.query(
      `SELECT * FROM guitar_tracks WHERE id = $1`,
      [trackId],
    );

    const track = trackResult.rows[0];

    if (!track) {
      return res.status(404).json({
        message: "track not found",
      });
    }

    const song = await getOwnedSong(track.song_id, req, res);

    if (!song) return;

    await db.query(`DELETE FROM guitar_tracks WHERE id = $1`, [trackId]);

    res.status(200).json({
      message: "Track Deleted Successfully",
    });
  } catch (error) {
    console.error("Delete guitar track error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.get("/guitar-tracks/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const result = await db.query(
      `
            SELECT id, name, instrument
            FROM guitar_tracks
            WHERE song_id = $1
            `,
      [songId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get guitar tracks error:", error);

    res.status(500).json({
      message: "failed to get guitar tracks",
    });
  }
});

app.get("/guitar-tracks/:trackId/notes", requireAuth, async (req, res) => {
  const { trackId } = req.params;

  try {
    const trackResult = await db.query(
      `SELECT * FROM guitar_tracks WHERE id = $1`,
      [trackId],
    );

    const track = trackResult.rows[0];

    if (!track) {
      return res.status(404).json({
        message: "track not found",
      });
    }

    const songId = track.song_id;

    if (!songId) return;

    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const result = await db.query(
      `
            SELECT "row", col, octave
            FROM notes
            WHERE track_id = $1
            `,
      [trackId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get song notes error:", error);

    res.status(500).json({
      message: "failed to get song notes",
    });
  }
});

app.post("/drum-tracks", requireAuth, async (req, res) => {
  const { song_id, track_name, drum_hits } = req.body;

  try {
    const song = await getOwnedSong(song_id, req, res);

    if (!song) return;

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const trackResult = await client.query(
        `
                INSERT INTO drum_tracks
                    (song_id, name)
                VALUES
                    ($1, $2)
                RETURNING id
                `,
        [song_id, track_name],
      );

      const newTrackId = trackResult.rows[0].id;

      for (const hit of drum_hits) {
        await client.query(
          `
                    INSERT INTO drum
                        (drum_id, drum_type, col)
                    VALUES
                        ($1, $2, $3)
                    `,
          [newTrackId, hit.drum_type, hit.col],
        );
      }

      await client.query("COMMIT");

      res.status(200).json({
        message: "Track Saved",
        track_id: newTrackId,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("drum-tracks error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.get("/drum-tracks/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const result = await db.query(
      `
            SELECT id, name
            FROM drum_tracks
            WHERE song_id = $1
            `,
      [songId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get drum tracks error:", error);

    res.status(500).json({
      message: "failed to get drum tracks",
    });
  }
});

app.post("/delete/drum-tracks", requireAuth, async (req, res) => {
  const { trackId } = req.body;

  try {
    const trackResult = await db.query(
      `SELECT * FROM drum_tracks WHERE id = $1`,
      [trackId],
    );

    const track = trackResult.rows[0];

    if (!track) {
      return res.status(404).json({
        message: "track not found",
      });
    }

    const song = await getOwnedSong(track.song_id, req, res);

    if (!song) return;

    await db.query(`DELETE FROM drum_tracks WHERE id = $1`, [trackId]);

    res.status(200).json({
      message: "Drum track successfully deleted",
    });
  } catch (error) {
    console.error("Delete drum track error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.get("/drum-tracks/:trackId/hits", requireAuth, async (req, res) => {
  const { trackId } = req.params;

  try {
    const trackResult = await db.query(
      `SELECT * FROM drum_tracks WHERE id = $1`,
      [trackId],
    );

    const track = trackResult.rows[0];

    if (!track) {
      return res.status(404).json({
        message: "track not found",
      });
    }

    const song = await getOwnedSong(track.song_id, req, res);

    if (!song) return;

    const result = await db.query(
      `
            SELECT drum_type, col
            FROM drum
            WHERE drum_id = $1
            `,
      [trackId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get drum hits error:", error);

    res.status(500).json({
      message: "failed to get drum hits",
    });
  }
});

app.post("/rhythm-guitar/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const { trackName, chordSlots, strumPattern } = req.body;

    const result = await db.query(
      `
            INSERT INTO rhythm_tracks
                (
                    song_id,
                    name,
                    chord_slots,
                    strum_pattern
                )
            VALUES
                ($1, $2, $3, $4)
            RETURNING *
            `,
      [
        songId,
        trackName,
        JSON.stringify(chordSlots),
        JSON.stringify(strumPattern),
      ],
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Insert rhythm guitar track error:", error);

    res.status(500).json({
      message: "failed to insert rhythm guitar track",
    });
  }
});

app.get("/rhythm-guitar/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) {
      return;
    }

    const result = await db.query(
      `
            SELECT *
            FROM rhythm_tracks
            WHERE song_id = $1
            `,
      [songId],
    );

    const parsed = result.rows.map((track) => ({
      ...track,
      chord_slots: JSON.parse(track.chord_slots),
      strum_pattern: JSON.parse(track.strum_pattern),
    }));

    res.status(200).json(parsed);
  } catch (error) {
    console.error("Get rhythm guitar tracks error:", error);

    res.status(500).json({
      message: "failed to retrieve rhythm guitar tracks",
    });
  }
});

app.post("/delete/rhythm-guitar", requireAuth, async (req, res) => {
  const { trackId } = req.body;

  try {
    const trackResult = await db.query(
      `SELECT * FROM rhythm_tracks WHERE id = $1`,
      [trackId],
    );

    const track = trackResult.rows[0];

    if (!track) {
      return res.status(404).json({
        message: "track not found",
      });
    }

    const song = await getOwnedSong(track.song_id, req, res);

    if (!song) return;

    await db.query(`DELETE FROM rhythm_tracks WHERE id = $1`, [trackId]);

    res.status(200).json({
      message: "Rhythm track successfully deleted",
    });
  } catch (error) {
    console.error("Delete rhythm track error:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

app.post("/automation/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const { trackType, trackId, name, col } = req.body;

    const result = await db.query(
      `
            INSERT INTO automation
                (
                    song_id,
                    track_id,
                    track_type,
                    name,
                    col
                )
            VALUES
                ($1, $2, $3, $4, $5)
            RETURNING *
            `,
      [songId, trackId, trackType, name, col],
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Post automation error:", error);

    res.status(500).json({
      message: "failed to post automation",
    });
  }
});

app.get("/automation/:songId", requireAuth, async (req, res) => {
  const { songId } = req.params;

  try {
    const song = await getOwnedSong(songId, req, res);

    if (!song) return;

    const result = await db.query(
      `
            SELECT
                track_id,
                track_type,
                name,
                col
            FROM automation
            WHERE song_id = $1
            `,
      [songId],
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Get automation error:", error);

    res.status(500).json({
      message: "failed to retrieve automation",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
