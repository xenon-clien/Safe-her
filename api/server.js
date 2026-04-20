console.log("📁 Server file loaded...");
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const twilio = require('twilio');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

// --- Configuration Loader ---
const rootPath = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(rootPath, '.env') }); 

// Initialize Express App
const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// --- SENTINEL DISPATCHER SYSTEM (SOS Queue) ---
let sosQueue = {
    async add(type, data) {
        console.log(`📡 [SENTINEL DISPATCH] Processing ${type}...`);
        const { contacts, message } = data;
        
        if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN) {
            try {
                const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
                for (let phone of contacts) {
                    await twilioClient.messages.create({
                        body: message,
                        from: process.env.TWILIO_PHONE,
                        to: phone
                    });
                }
                console.log("✅ [SENTINEL] Twilio Alerts Delivered.");
            } catch (err) {
                console.error("❌ [SENTINEL] Twilio Failure:", err.message);
            }
        } else {
            console.log("⚠️ [SIMULATOR] Terminal Alert Broadcast:");
            if (contacts && Array.isArray(contacts)) {
                contacts.forEach(c => console.log(`   👉 TO: ${c} | MSG: ${message}`));
            }
        }
    }
};

// Redis Mode Activation
if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    try {
        const redisConn = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: 0 });
        sosQueue = new Queue('sos_alerts', { connection: redisConn });
        console.log("✅ Redis Queue Integrated.");
    } catch (e) {
        console.warn("⚠️ Redis fail, using direct dispatch.");
    }
}

// Schemas & Models
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: String,
    role: { type: String, default: 'user' },
    isPremium: { type: Boolean, default: false }
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return enteredPassword === this.password; // Simplified for this project
};

const User = mongoose.model('User', userSchema);

const contactSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    contactName: String,
    contactPhone: String
});
const EmergencyContact = mongoose.model('EmergencyContact', contactSchema);

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({
        server: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
        g_client_id: process.env.G_CLIENT_ID || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com"
    });
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "User exists" });
        const newUser = new User({ name, email, password, phone });
        await newUser.save();
        res.status(201).json({ message: "Registered", userId: newUser._id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        let { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        res.json({ user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/sos-trigger', async (req, res) => {
    try {
        const { userId, lat, lng } = req.body;
        const user = await User.findById(userId);
        const contacts = await EmergencyContact.find({ userId });
        const alertText = `🚨 SOS EMERGENCY: ${user?.name || 'User'} needs help! 📍 maps.google.com/?q=${lat},${lng}`;
        await sosQueue.add('send_sms', { contacts: contacts.map(c => c.contactPhone), message: alertText });
        res.json({ message: "SOS Distributed" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/google-login-verify', async (req, res) => {
    try {
        const { token } = req.body;
        const googleClient = new OAuth2Client(process.env.G_CLIENT_ID);
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.G_CLIENT_ID
        });
        const { email, name } = ticket.getPayload();
        let user = await User.findOne({ email });
        if (!user) {
            user = new User({ name, email, password: crypto.randomBytes(16).toString('hex'), phone: "PENDING" });
            await user.save();
        }
        res.json({ user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) { res.status(401).json({ message: "Auth Failed" }); }
});

app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;
        const newContact = new EmergencyContact({ userId, contactName, contactPhone });
        await newContact.save();
        res.status(201).json({ message: "Contact Saved", contact: newContact });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/get-contacts/:userId', async (req, res) => {
    try {
        const contacts = await EmergencyContact.find({ userId: req.params.userId });
        res.json({ contacts });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Database Connection (Sentinel Neural Reconnect)
const connectDB = async () => {
    try {
        const options = {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            family: 4,
            heartbeatFrequencyMS: 10000
        };
        console.log("📡 Attempting Neural Link with MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI, options);
        console.log("✅ MongoDB Connected: Neural Link Stable");
    } catch (e) {
        console.error("❌ DB Error:", e.message);
        console.warn("🔄 Retrying connection in 5 seconds...");
        setTimeout(connectDB, 5000);
    }
};

mongoose.connection.on('error', (err) => {
    console.error("⚠️ Neural Link Fluctuating:", err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ Neural Link Severed. Initiating Auto-Heal...");
    connectDB();
});

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 SERVER ONLINE ON PORT ${PORT}`);
});
