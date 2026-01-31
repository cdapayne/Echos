// Application state
let currentUser = null;
let currentRecipient = null;
let ws = null;
let crypto = new CryptoHelper();
let recipientPublicKeys = new Map();

// Show/Hide forms
function showRegister() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('error-message').textContent = '';
}

function showLogin() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('error-message').textContent = '';
}

// Registration
async function register() {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    try {
        // Generate encryption key pair
        await crypto.generateKeyPair();
        const publicKey = await crypto.exportPublicKey();
        const privateKey = await crypto.exportPrivateKey();
        
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, publicKey })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Store private key in localStorage (in production, use secure storage)
            localStorage.setItem('privateKey', privateKey);
            showError('Registration successful! Please login.', 'success');
            showLogin();
        } else {
            showError(data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Registration failed');
    }
}

// Login
async function login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data;
            
            // Load private key from localStorage
            const privateKey = localStorage.getItem('privateKey');
            if (privateKey) {
                await crypto.importPrivateKey(privateKey);
            }
            
            // Switch to chat interface
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('chat-container').style.display = 'block';
            document.getElementById('current-username').textContent = username;
            
            // Connect to WebSocket
            connectWebSocket();
            
            // Load users list
            loadUsers();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Login failed');
    }
}

// Logout
function logout() {
    if (ws) {
        ws.close();
    }
    currentUser = null;
    currentRecipient = null;
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'block';
    showLogin();
}

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        ws.send(JSON.stringify({ type: 'auth', userId: currentUser.userId }));
    };
    
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
            // Received a new message
            await displayReceivedMessage(data);
        } else if (data.type === 'warning') {
            alert(data.message);
        } else if (data.type === 'error') {
            alert('Error: ' + data.error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(() => {
            if (currentUser) {
                connectWebSocket();
            }
        }, 3000);
    };
}

// Load users list
async function loadUsers() {
    try {
        const response = await fetch('/api/users');
        const data = await response.json();
        
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        data.users.forEach(user => {
            if (user.id !== currentUser.userId) {
                const userDiv = document.createElement('div');
                userDiv.className = 'user-item';
                userDiv.textContent = user.username;
                userDiv.onclick = () => selectUser(user);
                usersList.appendChild(userDiv);
            }
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Select a user to chat with
async function selectUser(user, event) {
    currentRecipient = user;
    
    // Highlight selected user
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    // Update chat header
    document.getElementById('chat-header').innerHTML = `<h3>Chat with ${user.username}</h3>`;
    
    // Load conversation history
    await loadMessages();
    
    // Get recipient's public key
    const keyResponse = await fetch(`/api/users/${user.username}/public-key`);
    const keyData = await keyResponse.json();
    recipientPublicKeys.set(user.id, await crypto.importPublicKey(keyData.publicKey));
}

// Load messages
async function loadMessages() {
    try {
        const response = await fetch(`/api/messages/${currentUser.userId}/${currentRecipient.id}`);
        const data = await response.json();
        
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';
        
        for (const message of data.messages) {
            await displayMessage(message);
        }
        
        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display a message
async function displayMessage(message) {
    const messagesContainer = document.getElementById('messages-container');
    const messageDiv = document.createElement('div');
    
    const isOwn = message.from_user_id === currentUser.userId;
    messageDiv.className = `message ${isOwn ? 'own-message' : 'other-message'}`;
    
    // Decrypt message
    const decryptedText = await crypto.decrypt(message.encrypted_content);
    
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(decryptedText)}</div>
        <div class="message-time">${new Date(message.timestamp).toLocaleString()}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
}

// Display received message
async function displayReceivedMessage(data) {
    if (currentRecipient && data.fromUserId === currentRecipient.id) {
        const message = {
            from_user_id: data.fromUserId,
            to_user_id: currentUser.userId,
            encrypted_content: data.encryptedContent,
            timestamp: data.timestamp
        };
        await displayMessage(message);
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Send message
async function sendMessage() {
    if (!currentRecipient) {
        alert('Please select a user to chat with');
        return;
    }
    
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message) {
        return;
    }
    
    // Validate text-only (no base64 or special content)
    if (isInvalidContent(message)) {
        alert('Invalid content: Only plain text messages are allowed. No base64, binary data, or media files.');
        return;
    }
    
    try {
        // Encrypt message with recipient's public key
        const recipientPublicKey = recipientPublicKeys.get(currentRecipient.id);
        const encryptedContent = await crypto.encrypt(message, recipientPublicKey);
        
        // Also encrypt for self (to store in database)
        const selfPublicKey = await crypto.importPublicKey(currentUser.publicKey);
        const selfEncryptedContent = await crypto.encrypt(message, selfPublicKey);
        
        // Send via WebSocket with plaintext for server-side moderation
        ws.send(JSON.stringify({
            type: 'message',
            toUserId: currentRecipient.id,
            encryptedContent: selfEncryptedContent,
            plaintext: message  // For content moderation on server
        }));
        
        // Clear input
        input.value = '';
        
        // Display message immediately
        const messageData = {
            from_user_id: currentUser.userId,
            to_user_id: currentRecipient.id,
            encrypted_content: selfEncryptedContent,
            timestamp: new Date().toISOString()
        };
        await displayMessage(messageData);
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Check for invalid content (base64, images, etc.)
function isInvalidContent(text) {
    // Check for data URLs
    if (text.includes('data:')) {
        return true;
    }
    
    // Check for long base64-like strings
    const base64Pattern = /^(?:[A-Za-z0-9+\/]{100,}={0,2})$/;
    if (base64Pattern.test(text.replace(/\s/g, ''))) {
        return true;
    }
    
    return false;
}

// Show admin panel
async function showAdmin() {
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('admin-container').style.display = 'block';
    
    try {
        const response = await fetch('/api/admin/flagged');
        const data = await response.json();
        
        const flaggedList = document.getElementById('flagged-list');
        flaggedList.innerHTML = '';
        
        if (data.flagged.length === 0) {
            flaggedList.innerHTML = '<p>No flagged conversations</p>';
        } else {
            data.flagged.forEach(item => {
                const flaggedDiv = document.createElement('div');
                flaggedDiv.className = 'flagged-item';
                
                const messages = JSON.parse(item.decrypted_messages);
                
                flaggedDiv.innerHTML = `
                    <h3>Flagged Conversation</h3>
                    <p><strong>Between:</strong> ${item.user1_username} and ${item.user2_username}</p>
                    <p><strong>Reason:</strong> ${item.reason}</p>
                    <p><strong>Flagged at:</strong> ${new Date(item.flagged_at).toLocaleString()}</p>
                    <p><strong>Flagged message:</strong> ${escapeHtml(messages.flaggedMessage)}</p>
                    <hr>
                `;
                
                flaggedList.appendChild(flaggedDiv);
            });
        }
    } catch (error) {
        console.error('Error loading flagged conversations:', error);
    }
}

// Hide admin panel
function hideAdmin() {
    document.getElementById('admin-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'block';
}

// Utility functions
function showError(message, type = 'error') {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.className = type;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle Enter key in message input
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
