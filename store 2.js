// --- Imports from Baileys ---
// Only import the necessary types and utilities, NOT the store function itself
const { 
    jidDecode, 
    // We import these only for binding later
    WASocket, 
    WAChat, 
    WAMessage, 
    Contact,
} = require("@whiskeysockets/baileys"); 
// ----------------------------

// --- Manual Implementation of InMemoryStore ---
// This is copied from the official Baileys source to bypass import issues

class WABotStore {
    constructor(logger) {
        this.chats = new Map();
        this.contacts = new Map();
        this.messages = new Map();
        this.groupMetadata = new Map();
        this.state = {};
        this.logger = logger;
    }

    /**
     * Finds the most recent message in a chat.
     * @param {string} jid 
     * @returns {WAMessage | undefined}
     */
    loadMessage(jid) {
        const messages = this.messages.get(jid);
        if (messages && messages.size > 0) {
            return Array.from(messages.values()).pop();
        }
    }

    /**
     * Binds the store to the socket's event emitter.
     * @param {WASocket} sock 
     */
    bind(sock) {
        // --- Contacts ---
        sock.ev.on('contacts.upsert', contacts => {
            for (const contact of contacts) {
                this.contacts.set(contact.id, contact);
            }
        });
        sock.ev.on('contacts.update', updates => {
            for (const update of updates) {
                const contact = this.contacts.get(update.id);
                if (contact) {
                    Object.assign(contact, update);
                    this.contacts.set(contact.id, contact);
                }
            }
        });

        // --- Chats ---
        sock.ev.on('chats.upsert', chats => {
            for (const chat of chats) {
                this.chats.set(chat.id, chat);
            }
        });
        sock.ev.on('chats.update', updates => {
            for (const update of updates) {
                const chat = this.chats.get(update.id);
                if (chat) {
                    Object.assign(chat, update);
                    this.chats.set(chat.id, chat);
                }
            }
        });
        sock.ev.on('chats.delete', deletions => {
            for (const id of deletions) {
                this.chats.delete(id);
            }
        });

        // --- Messages ---
        sock.ev.on('messages.upsert', ({ messages, type }) => {
            if (type !== 'append') {
                for (const msg of messages) {
                    let map = this.messages.get(msg.key.remoteJid);
                    if (!map) {
                        map = new Map();
                        this.messages.set(msg.key.remoteJid, map);
                    }
                    map.set(msg.key.id, msg);
                }
            }
        });
        
        sock.ev.on('messages.update', updates => {
             for (const update of updates) {
                const map = this.messages.get(update.key.remoteJid);
                if (map) {
                    const message = map.get(update.key.id);
                    if (message) {
                        Object.assign(message, update);
                        map.set(update.key.id, message);
                    }
                }
            }
        });
        
        sock.ev.on('messages.delete', ({ keys }) => {
            for (const key of keys) {
                const map = this.messages.get(key.remoteJid);
                if (map) {
                    map.delete(key.id);
                }
            }
        });

        // --- Group Metadata (Required for group name/admin status) ---
        sock.ev.on('groups.upsert', groups => {
            for (const group of groups) {
                this.groupMetadata.set(group.id, group);
            }
        });
        sock.ev.on('groups.update', updates => {
            for (const update of updates) {
                const group = this.groupMetadata.get(update.id);
                if (group) {
                    Object.assign(group, update);
                    this.groupMetadata.set(group.id, group);
                }
            }
        });
        
        // --- Other Events (Optional but good for completeness) ---
        sock.ev.on('presence.update', updates => {}); 
        sock.ev.on('blocklist.update', update => {}); 
    }
}

/**
 * The final exported function that creates an instance of the manual store.
 * @param {object} logger - pino logger instance.
 * @returns {WABotStore}
 */
const makeInMemoryStore = (logger) => new WABotStore(logger);

module.exports = { makeInMemoryStore };