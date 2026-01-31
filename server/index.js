const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize SQLite database
const db = new Database('echos.db');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    public_key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    flagged BOOLEAN DEFAULT 0,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS flagged_conversations (
    id TEXT PRIMARY KEY,
    user1_id TEXT NOT NULL,
    user2_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    decrypted_messages TEXT NOT NULL,
    flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id),
    FOREIGN KEY (user2_id) REFERENCES users(id)
  );
`);

app.use(express.json());
app.use(express.static('public'));

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Store active WebSocket connections
const connections = new Map();

// Nefarious keywords for content moderation
const nefariousKeywords = [
  'bomb', 'weapon', 'drug', 'hack', 'steal', 'illegal', 
  'terrorist', 'attack', 'kill', 'murder', 'threat'
];

// Check if message contains nefarious content
function checkNefariousContent(text) {
  const lowerText = text.toLowerCase();
  for (const keyword of nefariousKeywords) {
    if (lowerText.includes(keyword)) {
      return { flagged: true, keyword };
    }
  }
  return { flagged: false };
}

// Check if content is text-only (no base64, images, etc.)
function isTextOnly(content) {
  // Check for base64 encoded data
  const base64Pattern = /^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/;
  const dataUrlPattern = /^data:.*;base64,/;
  
  // Reject if it looks like base64 or data URL
  if (base64Pattern.test(content.trim()) || dataUrlPattern.test(content)) {
    return false;
  }
  
  // Check for binary content indicators
  const binaryIndicators = ['\\x', '\\u0000', '\0'];
  for (const indicator of binaryIndicators) {
    if (content.includes(indicator)) {
      return false;
    }
  }
  
  return true;
}

// User registration endpoint
app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { username, password, publicKey } = req.body;
    
    if (!username || !password || !publicKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    // Insert user
    const stmt = db.prepare('INSERT INTO users (id, username, password_hash, public_key) VALUES (?, ?, ?, ?)');
    stmt.run(userId, username, passwordHash, publicKey);
    
    res.json({ success: true, userId });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

// User login endpoint
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate session token (in production, use JWT)
    const sessionToken = uuidv4();
    
    res.json({ 
      success: true, 
      userId: user.id,
      username: user.username,
      publicKey: user.public_key,
      sessionToken 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get user's public key
app.get('/api/users/:username/public-key', apiLimiter, (req, res) => {
  try {
    const stmt = db.prepare('SELECT public_key FROM users WHERE username = ?');
    const user = stmt.get(req.params.username);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ publicKey: user.public_key });
  } catch (error) {
    console.error('Get public key error:', error);
    res.status(500).json({ error: 'Failed to get public key' });
  }
});

// Get list of users
app.get('/api/users', apiLimiter, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, username FROM users ORDER BY username');
    const users = stmt.all();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get conversation history
app.get('/api/messages/:userId1/:userId2', apiLimiter, (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    
    const stmt = db.prepare(`
      SELECT * FROM messages 
      WHERE (from_user_id = ? AND to_user_id = ?) 
         OR (from_user_id = ? AND to_user_id = ?)
      ORDER BY timestamp ASC
    `);
    
    const messages = stmt.all(userId1, userId2, userId2, userId1);
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Admin endpoint to get flagged conversations
// Note: In production, implement proper admin authentication and authorization
app.get('/api/admin/flagged', apiLimiter, (req, res) => {
  // TODO: Add authentication check for admin users
  // Example: if (!req.user || !req.user.isAdmin) { return res.status(403).json({ error: 'Forbidden' }); }
  
  try {
    const stmt = db.prepare(`
      SELECT fc.*, 
             u1.username as user1_username,
             u2.username as user2_username
      FROM flagged_conversations fc
      JOIN users u1 ON fc.user1_id = u1.id
      JOIN users u2 ON fc.user2_id = u2.id
      ORDER BY fc.flagged_at DESC
    `);
    
    const flagged = stmt.all();
    res.json({ flagged });
  } catch (error) {
    console.error('Get flagged conversations error:', error);
    res.status(500).json({ error: 'Failed to get flagged conversations' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  let userId = null;
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'auth') {
        userId = data.userId;
        connections.set(userId, ws);
        ws.send(JSON.stringify({ type: 'auth', success: true }));
      } else if (data.type === 'message') {
        const { toUserId, encryptedContent, plaintext } = data;
        
        // Validate text-only content
        if (!isTextOnly(encryptedContent)) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'Invalid content: Only text messages are allowed. No base64 or binary data.' 
          }));
          return;
        }
        
        // Check for nefarious content in plaintext (before encryption on client)
        const moderationResult = checkNefariousContent(plaintext);
        
        if (moderationResult.flagged) {
          // Flag the conversation and store decrypted messages
          const conversationId = uuidv4();
          
          // Get all messages between these users
          const stmt = db.prepare(`
            SELECT * FROM messages 
            WHERE (from_user_id = ? AND to_user_id = ?) 
               OR (from_user_id = ? AND to_user_id = ?)
            ORDER BY timestamp ASC
          `);
          const conversationMessages = stmt.all(userId, toUserId, toUserId, userId);
          
          // Store flagged conversation
          const flagStmt = db.prepare(`
            INSERT INTO flagged_conversations (id, user1_id, user2_id, reason, decrypted_messages)
            VALUES (?, ?, ?, ?, ?)
          `);
          
          const reason = `Detected nefarious keyword: "${moderationResult.keyword}"`;
          const decryptedMessages = JSON.stringify({
            messages: conversationMessages,
            flaggedMessage: plaintext
          });
          
          flagStmt.run(conversationId, userId, toUserId, reason, decryptedMessages);
          
          // Notify admin (in production, this would be a real-time notification)
          console.log(`ADMIN ALERT: Conversation flagged between users ${userId} and ${toUserId}`);
          console.log(`Reason: ${reason}`);
          
          ws.send(JSON.stringify({ 
            type: 'warning', 
            message: 'Your message has been flagged and sent to an administrator for review.' 
          }));
        }
        
        // Store message
        const messageId = uuidv4();
        const stmt = db.prepare(`
          INSERT INTO messages (id, from_user_id, to_user_id, encrypted_content, flagged)
          VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run(messageId, userId, toUserId, encryptedContent, moderationResult.flagged ? 1 : 0);
        
        // Send to recipient if online
        const recipientWs = connections.get(toUserId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: 'message',
            messageId,
            fromUserId: userId,
            encryptedContent,
            timestamp: new Date().toISOString()
          }));
        }
        
        // Confirm to sender
        ws.send(JSON.stringify({ 
          type: 'sent', 
          messageId,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ type: 'error', error: 'Message processing failed' }));
    }
  });
  
  ws.on('close', () => {
    if (userId) {
      connections.delete(userId);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Echos server running on port ${PORT}`);
});
