import express from 'express'
import cors from 'cors'
import db from './db.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import 'dotenv/config'

const app = express()
const PORT = 3001
app.use(cors())
app.use(express.json())

app.listen(PORT, () => {
    console.log(`Server running on http:localhost:${PORT}`)
})

// make require authentication of token 
function requireAuth(req, res, next) {
    const auth = req.headers.authorization

    if (auth === undefined) {
        return res.status(401).json({message: 'Authorization Declined'})
    }

    const token = auth.split(' ')[1]

    try {
        const decodedPayload = jwt.verify(token, process.env.JWT_SECRET)
        req.userId = decodedPayload.id
        next()
    } catch (error) {
        res.status(401).json({message: 'Token invalid or expired'})
    }
}

// check ownership using token of a song
function getOwnedSong(song_id, req, res) {
    const song = db.prepare(`SELECT * FROM songs WHERE id = ?`).get(song_id)
    if (!song) {
        res.status(404).json({message: "song not found"})
        return null
    }
    if (req.userId !== song.user_id) {
        res.status(403).json({message: "you do not own this song"})
        return null
    }
    return song
}

// signup
    app.post('/signup', async (req, res) => {
        const {username, password} = req.body
        const hashedPassword = await bcrypt.hash(password, 10)

        try {
            const statement = db.prepare(`INSERT INTO users (username, password) VALUES (?,?)`)
            statement.run(username, hashedPassword)
            res.status(201).json({message: 'User Created'})
        } catch (error) {
            if (error.code === `SQLITE_CONSTRAINT_UNIQUE`) {
                res.status(400).json({message: 'Username is already taken'})
            } else {
                res.status(500).json({message: 'Error thrown'})
            }
        }
    })

// login
    app.post('/login', async (req, res) => {
        const {username, password} = req.body
        const statement = db.prepare(`SELECT * FROM users WHERE username = ?`)
        const user = statement.get(username)

        if (!user) {
            res.status(400).json({message: 'username or password incorrect'})
        } else {
            const passwordMatches = await bcrypt.compare(password, user.password)
            if (passwordMatches) {
                const token = jwt.sign(
                    {id: user.id},
                    process.env.JWT_SECRET,
                    {expiresIn: '24h'}
                )
                res.json({token})
            } else {
                res.status(400).json({message: 'username or password incorrect'})
            }
        }
    })

// create new song
app.post('/create', requireAuth, (req, res) => {
    const {title, bpm} = req.body
    const lastEdited = new Date().toISOString()
    const userId = req.userId
    const statement = db.prepare(`INSERT INTO songs (title, bpm, last_edited, user_id) VALUES (?,?,?,?)`)

    try {
        statement.run(title, bpm, lastEdited, userId)
        res.status(201).json({message: 'song created'})
    } catch (error) {
        res.status(500).json({message: 'error'})
    }
})

// delete existing song
app.post('/delete', requireAuth, (req, res) => {
    const songToDelete = req.body.id
    const song = getOwnedSong(songToDelete, req, res)
    if (!song) return

    try {
        db.prepare('DELETE FROM songs WHERE id = ?').run(songToDelete)
        res.status(200).json({message: 'song deleted'})
    } catch (error) {
        res.status(500).json({message: 'error'})
    }
})

// get all songs of a user
app.get('/songs', requireAuth, (req, res) => {
    try {
        const songs = db.prepare(`SELECT * FROM songs WHERE user_id = ?`).all(req.userId)
        res.status(200).json(songs)
    } catch (error) {
        res.status(500).json({message: 'error'})
    }
})

// edit existing song
app.put('/songs/:id', requireAuth, (req, res) => {
    const songId = req.params.id
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    try {
        const {title, bpm} = req.body
        const timeEdited = new Date().toISOString()
        db.prepare(`UPDATE songs SET title = ?, bpm = ?, last_edited = ? WHERE id = ?`).run(title, bpm, timeEdited, songId)
        res.status(200).json({message: 'change applied'})
    } catch (error) {
        res.status(500).json({message: 'update failed'})
    }
})

// get a specific song based on id
app.get('/songs/:id', requireAuth, (req, res) => {
    const songId = req.params.id
    const song = getOwnedSong(songId, req, res)
    if (!song) return
    res.status(200).json(song)
})

// make a guitar track
app.post('/guitar-tracks', requireAuth, (req, res) => {
  const { song_id, track_name, guitar_notes, instrument} = req.body
  const song = getOwnedSong(song_id, req, res)
  if (!song) return

  try {
    const trackStatement = db.prepare(`INSERT INTO guitar_tracks (song_id, instrument, name) VALUES (?, ?, ?)`)
    const result = trackStatement.run(song_id, instrument, track_name)
    const newTrackId = result.lastInsertRowid

    const notesStatement = db.prepare(`INSERT INTO notes (track_id, row, col, octave) VALUES (?, ?, ?, ?)`)
    guitar_notes.forEach((note) => {
      notesStatement.run(newTrackId, note.row, note.col, note.octave)
    })

    res.status(200).json({ message: "Track Saved", track_id: newTrackId })
  } catch (error) {
    console.error("drum-tracks error:", error);
    res.status(500).json({ message: error.message })
  }
})

// get all guitar tracks from a song
app.get('/guitar-tracks/:songId', requireAuth, (req, res) => {
    const {songId} = req.params
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    try {
        const tracks = db.prepare(`SELECT id, name FROM guitar_tracks WHERE song_id = ?`).all(songId)
        res.status(200).json(tracks)
    } catch (error) {
        res.status(500).json({message: "failed to get guitar tracks"})
    }
})

// get all notes from a guitar track
app.get('/guitar-tracks/:trackId/notes', requireAuth, (req, res) => {
    const {trackId} = req.params
    const track = db.prepare(`SELECT * FROM guitar_tracks WHERE id = ?`).get(trackId)
    if (!track) {return res.status(404).json({message:"track not found"})}
    
    const songId = track.song_id
    if (!songId) return
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    try {
        const notes = db.prepare(`SELECT row, col, octave FROM notes WHERE track_id = ?`).all(trackId)
        res.status(200).json(notes)
    } catch (error) {
        res.status(500).json({message: "failed to get song notes"})
    }
})

// make a drum track
app.post('/drum-tracks', requireAuth, (req, res) => {
  const { song_id, track_name, drum_hits } = req.body
  const song = getOwnedSong(song_id, req, res)
  if (!song) return

  try {
    const trackStatement = db.prepare(`INSERT INTO drum_tracks (song_id, name) VALUES (?, ?)`)
    const result = trackStatement.run(song_id, track_name)
    const newTrackId = result.lastInsertRowid

    const hitStatement = db.prepare(`INSERT INTO drum (drum_id, drum_type, col) VALUES (?, ?, ?)`)
    drum_hits.forEach((hit) => {
      hitStatement.run(newTrackId, hit.drum_type, hit.col)
    })

    res.status(200).json({ message: "Track Saved", track_id: newTrackId });
  } catch (error) {
    console.error("drum-tracks error:", error)
    res.status(500).json({ message: error.message })
  }
});

// get all drum tracks
app.get('/drum-tracks/:songId', requireAuth, (req, res) => {
    const {songId} = req.params
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    try {
        const tracks = db.prepare(`SELECT id, name FROM drum_tracks WHERE song_id = ?`).all(songId)
        res.status(200).json(tracks)
    } catch (error) {
        res.status(500).json({message: "failed to get drum tracks"})
    }
})

// get hits from a drum track
app.get('/drum-tracks/:trackId/hits', requireAuth, (req,res) => { 
    const {trackId} = req.params
    const track = db.prepare(`SELECT * FROM drum_tracks WHERE id = ?`).get(trackId)
    if (!track) {return res.status(404).json({message: "track not found"})}
    const songId = track.song_id
    
    const song = getOwnedSong(songId, req, res)
    if (!song) return
    
    try {
        const hitStatement = db.prepare(`SELECT drum_type, col FROM drum WHERE drum_id = ?`).all(trackId)
        res.status(200).json(hitStatement)
    } catch(error) {
        res.status(500).json({message: "failed to get drum hits"})
    }
})

app.post('/rhythm-guitar/:songId', requireAuth,  (req,res) => {
    const {songId} = req.params
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    const {trackName, chordSlots, strumPattern} = req.body 

    try {
        const statement = db.prepare(`INSERT INTO rhythm_tracks (song_id, name, chord_slots, strum_pattern) VALUES (?,?,?,?)`)
            .run(songId, trackName, JSON.stringify(chordSlots), JSON.stringify(strumPattern))
        res.status(200).json(statement)
    } catch(error) {
        res.status(500).json({message: "failed to insert rhythm guitar track"})
    }
})

app.get('/rhythm-guitar/:songId', requireAuth, (req,res) => {
    const {songId} = req.params
    const song = getOwnedSong(songId, req, res)
    if (!song) return

    try {
        const track = db.prepare(`SELECT * FROM rhythm_tracks WHERE song_id = ?`).all(songId)
        const parsed = track.map(t => ({
            ...t,
            chord_slots: JSON.parse(t.chord_slots),
            strum_pattern: JSON.parse(t.strum_pattern)
        }))
    } catch (error) {
        res.status(500).json({message: "failed to retrieve rhythm guitar tracks"})
    }
})


// const notes = db.prepare(`SELECT * FROM notes WHERE song_id = ? AND instrument = ?`).all(songId, instrument)
// res.status(200).json(notes)