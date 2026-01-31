# Echos

Echos is a secure, end-to-end encrypted text-only messaging platform designed for private communication with built-in content moderation and admin discovery features.

## Features

### 🔒 Security & Encryption
- **End-to-End Encryption**: All messages are encrypted on the client-side using RSA-OAEP (2048-bit) before transmission
- **Unique User Keys**: Each user has a unique public/private key pair for encryption/decryption
- **Text-Only Messaging**: Strict validation to prevent photos, base64-encoded data, or binary content
- **Secure Transit**: Messages remain encrypted during transmission via WebSocket connections

### 🛡️ Content Moderation
- **Automatic Detection**: Server-side detection of nefarious keywords in plaintext before encryption
- **Conversation Flagging**: Suspicious conversations are automatically flagged and stored
- **Admin Discovery**: Flagged conversations are unencrypted and sent to admin panel for review
- **Real-time Alerts**: Admins are notified when conversations are flagged

### 💬 Messaging Features
- **Real-time Communication**: WebSocket-based instant messaging
- **Global Reach**: Users can communicate with anyone in the world
- **User Directory**: Browse and connect with all registered users
- **Message History**: Persistent conversation storage with encryption

## Architecture

### Backend (Node.js)
- **Express.js**: HTTP server for REST API endpoints
- **WebSocket (ws)**: Real-time bidirectional communication
- **SQLite (better-sqlite3)**: Lightweight database for users, messages, and flagged content
- **bcrypt**: Secure password hashing
- **Content Filtering**: Keyword-based detection system

### Frontend (Vanilla JavaScript)
- **Web Crypto API**: Client-side encryption/decryption
- **Responsive UI**: Clean, modern interface
- **Admin Panel**: Review flagged conversations

### Database Schema
```sql
users
  - id (TEXT PRIMARY KEY)
  - username (TEXT UNIQUE)
  - password_hash (TEXT)
  - public_key (TEXT)
  - created_at (DATETIME)

messages
  - id (TEXT PRIMARY KEY)
  - from_user_id (TEXT FK)
  - to_user_id (TEXT FK)
  - encrypted_content (TEXT)
  - timestamp (DATETIME)
  - flagged (BOOLEAN)

flagged_conversations
  - id (TEXT PRIMARY KEY)
  - user1_id (TEXT FK)
  - user2_id (TEXT FK)
  - reason (TEXT)
  - decrypted_messages (TEXT JSON)
  - flagged_at (DATETIME)
```

## Installation

### Prerequisites
- Node.js 16+ and npm

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd Echos

# Install dependencies
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### User Registration
1. Open the application in your browser
2. Click "Register" to create a new account
3. Enter username and password
4. System automatically generates encryption keys
5. Private key is stored in browser localStorage

### Sending Messages
1. Login with your credentials
2. Select a user from the sidebar
3. Type your message (text-only)
4. Press Enter or click Send
5. Message is encrypted and sent

### Content Moderation
Messages are automatically scanned for nefarious keywords:
- bomb, weapon, drug, hack, steal, illegal
- terrorist, attack, kill, murder, threat

When detected:
1. Conversation is flagged in database
2. Admin is notified
3. User receives warning notification
4. Message history is stored (unencrypted) for review

### Admin Panel
1. Click "Admin Panel" button
2. View all flagged conversations
3. See reason for flagging and message content
4. Review conversation history

## Security Considerations

### Encryption
- **RSA-OAEP 2048-bit**: Industry-standard asymmetric encryption
- **SHA-256 Hashing**: Used in key derivation
- **Client-side Encryption**: Messages encrypted before leaving device
- **No Server Access**: Server cannot decrypt messages without user keys

### Content Validation
- Base64 detection and blocking
- Data URL pattern rejection
- Binary content filtering
- Text-only enforcement

### Privacy Trade-off
⚠️ **Important**: To enable content moderation, plaintext messages are temporarily sent to the server for keyword scanning before encryption. This is necessary for the admin discovery feature but represents a privacy trade-off.

For maximum privacy, the system could be modified to:
- Remove server-side moderation
- Implement client-side hashing of messages for pattern matching
- Use homomorphic encryption (performance impact)

## Production Considerations

For production deployment, implement:

1. **Authentication**
   - JWT tokens instead of simple session tokens
   - Token refresh mechanism
   - Session expiration

2. **Key Management**
   - Secure key storage (not localStorage)
   - Key backup and recovery
   - Hardware security module (HSM) integration

3. **Database**
   - PostgreSQL or MySQL instead of SQLite
   - Database encryption at rest
   - Regular backups

4. **Security**
   - HTTPS/TLS for all connections
   - WSS (WebSocket Secure)
   - Rate limiting
   - Input sanitization
   - CSRF protection
   - Content Security Policy headers

5. **Monitoring**
   - Real-time admin notifications
   - Audit logging
   - Security event tracking

6. **Scalability**
   - Redis for session management
   - Message queue for async processing
   - Load balancing
   - Horizontal scaling

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login

### Users
- `GET /api/users` - List all users
- `GET /api/users/:username/public-key` - Get user's public key

### Messages
- `GET /api/messages/:userId1/:userId2` - Get conversation history

### Admin
- `GET /api/admin/flagged` - Get flagged conversations

### WebSocket Events
- `auth` - Authenticate WebSocket connection
- `message` - Send/receive encrypted message
- `warning` - Content moderation alert
- `error` - Error notification

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing style
- Security best practices are maintained
- Tests are included for new features
- Documentation is updated