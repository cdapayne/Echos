# Security Architecture and Trade-offs

## Overview

Echos implements a messaging system with encryption and content moderation. However, there are important security trade-offs to understand.

## Encryption vs. Content Moderation Trade-off

**The Fundamental Conflict:**
True end-to-end encryption (E2E) means that only the sender and recipient can read messages - not even the server. However, content moderation requires the server to analyze message content.

**Current Implementation:**
To satisfy the requirement for both encryption AND content moderation, this implementation makes the following trade-off:

1. **Plaintext to Server**: Messages are sent in plaintext to the server for content moderation BEFORE being encrypted
2. **Server-Side Scanning**: The server scans messages for nefarious keywords
3. **Encryption for Storage**: Messages are then encrypted and stored in the database
4. **Encrypted in Transit**: Messages are encrypted before being stored and transmitted to recipients

**Security Implications:**
- ⚠️ The server has access to message content during the moderation phase
- ⚠️ This is NOT true end-to-end encryption in the cryptographic sense
- ⚠️ Messages are vulnerable to server-side attacks or compromise
- ✓ Messages are encrypted at rest in the database
- ✓ Users' private keys never leave their devices
- ✓ Only the users can decrypt stored messages

## Identified Security Issues

### 1. Admin Endpoint - No Authentication
**Issue**: The `/api/admin/flagged` endpoint has no authentication checks. Any user can access flagged conversations.

**Impact**: HIGH - Unauthorized users can view flagged content and unencrypted messages.

**Mitigation**: 
- Implement proper admin user authentication
- Use role-based access control (RBAC)
- Add authentication middleware to admin routes

### 2. Private Key Storage
**Issue**: Private encryption keys are stored in browser `localStorage`.

**Impact**: MEDIUM - Keys are vulnerable to XSS attacks and accessible to any script.

**Mitigation for Production**:
- Use IndexedDB with encryption
- Implement secure key derivation from passwords
- Consider hardware-backed key storage (WebAuthn)
- Use secure enclaves on mobile devices

### 3. Session Management
**Issue**: Session tokens are generated but never validated.

**Impact**: MEDIUM - Session tokens provide no actual security benefit.

**Mitigation**:
- Implement JWT-based authentication
- Add token validation middleware
- Store sessions with expiration
- Implement token refresh mechanism

### 4. Base64 Detection False Positives
**Issue**: The base64 detection pattern may incorrectly flag legitimate text.

**Impact**: LOW - Users may be unable to send certain valid messages.

**Mitigation**:
- Check for data URL prefixes specifically
- Implement minimum length requirements
- Allow base64 in specific contexts (e.g., short strings)

### 5. Message Encryption Asymmetry
**Issue**: Messages are encrypted differently for sender and recipient, making it difficult for senders to decrypt their own sent messages from history.

**Impact**: LOW - UX issue where users can't always see their sent message history.

**Mitigation**:
- Store messages encrypted twice (once for each user)
- Or use a shared symmetric key for the conversation
- Or implement forward secrecy with ephemeral keys

## Alternative Architectures

### Option 1: True E2E Encryption (Remove Content Moderation)
- Remove server-side content scanning
- All messages encrypted on client before transmission
- Server cannot read any messages
- Implement client-side flagging or reporting system
- Manual review only when users report conversations

### Option 2: Hybrid Approach (Current)
- Server scans plaintext for moderation
- Messages encrypted after scanning
- Clear disclosure to users about server access
- Document the security trade-off

### Option 3: Encrypted Moderation
- Implement homomorphic encryption (computationally expensive)
- Use secure multi-party computation
- Implement client-side hash-based pattern matching
- More complex but maintains E2E encryption

## Recommendations for Production

1. **Be Transparent**: Clearly communicate to users that messages are scanned by the server
2. **Add Authentication**: Implement proper admin authentication and authorization
3. **Secure Key Storage**: Move away from localStorage for private keys
4. **Implement JWT**: Use proper token-based authentication
5. **Add Logging**: Implement comprehensive audit logging
6. **Rate Limiting**: Add rate limiting to prevent abuse
7. **HTTPS Only**: Enforce HTTPS/TLS in production
8. **Regular Security Audits**: Conduct penetration testing and security reviews
9. **Compliance**: Ensure compliance with relevant regulations (GDPR, etc.)
10. **User Consent**: Obtain explicit user consent for content monitoring

## Regulatory Considerations

- **GDPR**: User data processing requires consent and transparency
- **COPPA**: Additional protections for minors
- **Local Laws**: Vary by jurisdiction regarding content monitoring
- **Liability**: Legal responsibilities for moderated content

## Conclusion

This implementation prioritizes content moderation over true end-to-end encryption as specified in the requirements. This is a valid architectural choice for certain use cases (e.g., workplace communication, monitored platforms) but should be clearly communicated to users.

For a truly private messaging system, content moderation capabilities would need to be removed or significantly restructured.
