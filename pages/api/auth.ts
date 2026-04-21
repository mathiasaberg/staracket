import type { NextApiRequest, NextApiResponse } from 'next'
import crypto from 'crypto'

// Simple auth using hashed passwords stored in a JSON file
// In production, use a proper database. This uses a server-side in-memory store
// seeded from environment variable STARACKET_USERS (JSON string)
// Format: [{"username":"admin","passwordHash":"sha256hash"}]

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

function getUsers(): { username: string; passwordHash: string }[] {
  try {
    const raw = process.env.STARACKET_USERS || '[]'
    return JSON.parse(raw)
  } catch {
    return []
  }
}

// Simple token: sha256(username + ':' + timestamp + ':' + secret)
function createToken(username: string): string {
  const secret = process.env.EVERYSPORT_API_KEY || 'staracket-secret'
  const payload = `${username}:${Date.now()}`
  const sig = crypto.createHash('sha256').update(payload + secret).digest('hex')
  return Buffer.from(JSON.stringify({ u: username, t: Date.now(), s: sig })).toString('base64')
}

function verifyToken(token: string): string | null {
  try {
    const { u, t, s } = JSON.parse(Buffer.from(token, 'base64').toString())
    const secret = process.env.EVERYSPORT_API_KEY || 'staracket-secret'
    const expected = crypto.createHash('sha256').update(`${u}:${t}${secret}`).digest('hex')
    if (s !== expected) return null
    // Token valid for 7 days
    if (Date.now() - t > 7 * 24 * 60 * 60 * 1000) return null
    return u
  } catch {
    return null
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { action, username, password, token } = req.body || {}

  if (action === 'login') {
    if (!username || !password) {
      return res.status(400).json({ error: 'Användarnamn och lösenord krävs' })
    }
    const users = getUsers()
    const hash = hashPassword(password)
    const user = users.find(u => u.username === username && u.passwordHash === hash)
    if (!user) {
      return res.status(401).json({ error: 'Fel användarnamn eller lösenord' })
    }
    const newToken = createToken(username)
    return res.json({ token: newToken, username })
  }

  if (action === 'verify') {
    if (!token) return res.status(401).json({ error: 'Ingen token' })
    const user = verifyToken(token)
    if (!user) return res.status(401).json({ error: 'Ogiltig eller utgången token' })
    return res.json({ username: user })
  }

  if (action === 'register') {
    // Registration is protected - requires a valid admin token
    if (!token) return res.status(401).json({ error: 'Ingen token' })
    const adminUser = verifyToken(token)
    if (!adminUser) return res.status(401).json({ error: 'Ogiltig token' })

    if (!username || !password) {
      return res.status(400).json({ error: 'Användarnamn och lösenord krävs' })
    }
    const hash = hashPassword(password)
    // Return the hash so admin can add it to STARACKET_USERS env var
    return res.json({
      message: `Lägg till i STARACKET_USERS: {"username":"${username}","passwordHash":"${hash}"}`,
      entry: { username, passwordHash: hash }
    })
  }

  if (action === 'hash') {
    // Utility to generate a password hash for initial setup
    if (!password) return res.status(400).json({ error: 'Lösenord krävs' })
    return res.json({ passwordHash: hashPassword(password) })
  }

  return res.status(400).json({ error: 'Okänd action' })
}
