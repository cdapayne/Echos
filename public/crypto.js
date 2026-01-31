// Encryption module using Web Crypto API
class CryptoHelper {
    constructor() {
        this.privateKey = null;
        this.publicKey = null;
    }
    
    // Generate RSA key pair for user
    async generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        );
        
        this.privateKey = keyPair.privateKey;
        this.publicKey = keyPair.publicKey;
        
        return keyPair;
    }
    
    // Export public key to string
    async exportPublicKey() {
        const exported = await window.crypto.subtle.exportKey("spki", this.publicKey);
        return this.arrayBufferToBase64(exported);
    }
    
    // Import public key from string
    async importPublicKey(keyString) {
        const keyData = this.base64ToArrayBuffer(keyString);
        return await window.crypto.subtle.importKey(
            "spki",
            keyData,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["encrypt"]
        );
    }
    
    // Import private key from string
    async importPrivateKey(keyString) {
        const keyData = this.base64ToArrayBuffer(keyString);
        this.privateKey = await window.crypto.subtle.importKey(
            "pkcs8",
            keyData,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["decrypt"]
        );
    }
    
    // Export private key to string
    async exportPrivateKey() {
        const exported = await window.crypto.subtle.exportKey("pkcs8", this.privateKey);
        return this.arrayBufferToBase64(exported);
    }
    
    // Encrypt message with recipient's public key
    async encrypt(message, recipientPublicKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        
        const encrypted = await window.crypto.subtle.encrypt(
            { name: "RSA-OAEP" },
            recipientPublicKey,
            data
        );
        
        return this.arrayBufferToBase64(encrypted);
    }
    
    // Decrypt message with own private key
    async decrypt(encryptedMessage) {
        try {
            const encrypted = this.base64ToArrayBuffer(encryptedMessage);
            
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "RSA-OAEP" },
                this.privateKey,
                encrypted
            );
            
            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            console.error('Decryption error:', error);
            return '[Failed to decrypt message]';
        }
    }
    
    // Helper: Convert ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
    
    // Helper: Convert Base64 to ArrayBuffer
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Make CryptoHelper globally available
window.CryptoHelper = CryptoHelper;
