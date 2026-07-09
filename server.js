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

/* 
.run() = expecting no data back
.get() = expecting one column of data back
.all() = expecting multiple to all columns back
*/
