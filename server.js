import express from 'express'
import cors from 'cors'
import db from './db.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import 'dotenv/config'

const app = express() // server object, can add routes and tell it to start listening for calls
const PORT = 3001 
app.use(cors()) // allows the react app running on port 5731 to also allow other ports to communicate with the backend, on port 3001
app.use(express.json())

app.get('/', (req, res) => { // get response on root file name, (request, response)
    res.send("Server is working")
}) 

app.listen(PORT, () => { 
    console.log(`Server running on http:localhost:${PORT}`)
})

// function to confirm if / which user is making a database request
function requireAuth(req,res,next) {
    const auth = req.headers.authorization

    if (auth === undefined) {
        return res.status(401).json({message: 'Authorization Declined'}) // return to exit function
    }

    const token = auth.split(' ')[1] // removes the 'Bearer ' and recieves the token

    try {
        const decodedPayload = jwt.verify(token, process.env.JWT_SECRET)
        req.userId = decodedPayload.id// set userId to decodedPayload.id
        next() // tells to go to next function in the chain
    } catch (error) {
        res.status(401).json({message: 'Token invalid or expired'})
    }
}

// signup 
app.post('/signup', async (req, res) => { // needs async because hashing requires time to run
                                          // when data is entered into /signup, then express will automatically call this function
    const {username, password} = req.body
    const hashedPassword = await bcrypt.hash(password, 10)

    try {
        const statement = db.prepare(`INSERT INTO users (username, password) VALUES (?,?)`) // use ?,? to prevent injection attacks
                                                                                        // sql injection, a malicious user can input sql statements into areas where the database is accessed to try and access the database
        statement.run(username, hashedPassword) // replace (?,?...) with .run(parameters...)
        res.status(201).json({message: 'User Created'}) // response status (200 for success, 400/500 for fail)
    } catch (error) {
        if (error.code === `SQLITE_CONSTRAINT_UNIQUE`) { // constraint prevents certain data from being entered
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
            const token = jwt.sign( // send a jwt token
                {id: user.id}, // payload: data to be sent
                process.env.JWT_SECRET, // secret key used to sign it
                {expiresIn: '1h'}
            )
            res.json({token}) // token: token shortened because parameter name matches the variable name

        } else { 
           res.status(400).json({message: 'username or password incorrect'})
        }
    }
}) 

// create new song
app.post('/create', requireAuth, (req, res) => {
   const {title,bpm} = req.body
   const lastEdited = new Date().toISOString()
   const userId = req.userId // let server handle authentication, do not let user handle auth
   const statement = db.prepare(`INSERT INTO songs (title, bpm, last_edited, user_id) VALUES (?,?,?,?)`)
   
   try {
        statement.run(title, bpm, lastEdited,userId)
        res.status(201).json({message: 'song created'}) 
   } catch(error) {
        res.status(500).json({message: 'error'})
   }
})

// delete existing song
app.post('/delete', requireAuth, (req,res) => {
    const songToDelete = req.body.id
    const statement = db.prepare('DELETE FROM songs WHERE id = ?')
    const song = db.prepare(`SELECT * FROM songs WHERE id = ? `).get(songToDelete)
    
    if (!song) {
        return res.status(404).json({message: 'song not found'})
    }

    if (song.user_id !== req.userId) {
        return res.status(403).json({message: `you do not own this song`})
    }

    try {
        statement.run(songToDelete)
        res.status(200).json({message: 'song deleted'})
    } catch(error) {
        res.status(500).json({message: 'error'})
    }
})

// get all songs
app.get('/songs', requireAuth, (req, res) => {
    try {
        const list = db.prepare(`SELECT * FROM songs WHERE id = ?`).all(req.userId)
        res.status(200).json(songs)
    } catch (error) {
        res.status(500).json({message:'error'})
    }
})

// edit existing song
app.put('/songs/:id', requireAuth, (req,res) => {
    const songId = req.params.id
    const song = db.prepare(`SELECT * FROM songs WHERE id = ?`).get(songId)

    if (!song) {
        return res.status(404).json({message: `song not found`})
    }

    if (song.user_id !== req.userId) {
        return res.status(403).json({message: `you do not own this song`})
    }

    try {
        const {title, bpm} = req.body
        const timeEdited = new Date().toISOString()
        db.prepare(`UPDATE songs SET title = ?, bpm = ?, last_edited = ? WHERE id = ?`).run(title, bpm, timeEdited, songId)
        res.status(200).json({message: 'change applied'})
    } catch (error) {
        res.status(500).json({message: 'update failed'})
    }
})


/* 
.run() = expecting no data back
.get() = expecting one column of data back
.all() = expecting multiple to all columns back
*/

/*
200 OK               - request succeeded (general success, e.g. GET, PUT, DELETE)
201 Created          - new resource successfully created (e.g. POST /signup, POST /create)
400 Bad Request      - client sent invalid/malformed data
401 Unauthorized      - not logged in / missing or invalid token
403 Forbidden        - logged in, but not allowed to do this (e.g. don't own the resource)
404 Not Found        - resource doesn't exist
500 Internal Server Error - something broke on the server side, not the client's fault
*/