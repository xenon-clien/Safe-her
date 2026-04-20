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

app.get('/api/health', async (req, res) => {
    let dbStatus = "offline";
    try {
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.db.admin().ping();
            dbStatus = "connected";
        } else if (mongoose.connection.readyState === 2) {
            dbStatus = "connecting";
        } else {
            dbStatus = "offline";
        }
    } catch (e) {
        dbStatus = "reconnecting";
    }

    res.json({
        server: "online",
        database: dbStatus,
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

// --- UNIVERSAL SAFETY ORACLE (Gemini AI) ---
app.post(['/api/chat', '/chat'], async (req, res) => {
    try {
        const { message, history } = req.body;
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyClZFyLy0YPhwHvOTZN7UZeomajAeHLcJQ");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const chat = model.startChat({
            history: history || [],
            generationConfig: { maxOutputTokens: 250 }
        });

        const prompt = `You are the SafeHer AI Assistant. specialized in women safety and emergency protocols. 
        Your tone is calm, professional, and tactical. 
        If a user says they are in danger, advise them to press the SOS button immediately.
        Keep answers short and helpful. Support Hindi and English.
        User says: ${message}`;

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        res.json({ reply: response.text() });
    } catch (e) {
        console.error("AI Error:", e.message);
        res.status(500).json({ reply: "I'm currently syncing with satellite servers. For emergencies, please use the SOS button immediately." });
    }
});

// --- NEURAL PERSISTENCE: UNBREAKABLE DB LINK (Ironclad-Sync v11.5) ---
const connectDB = async () => {
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return;

    try {
        const options = {
            serverSelectionTimeoutMS: 45000,
            heartbeatFrequencyMS: 3000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 60000,
            family: 4,
            tlsAllowInvalidCertificates: true,
            retryWrites: true,
            w: 'majority',
            maxPoolSize: 10
        };
        const dbUri = process.env.MONGODB_URI || "mongodb://dhirajkumar9501445740_db_user:qzMRq88q6EKsTfaF@ac-uvtkyvu-shard-00-00.l2u06sf.mongodb.net:27017,ac-uvtkyvu-shard-00-01.l2u06sf.mongodb.net:27017,ac-uvtkyvu-shard-00-02.l2u06sf.mongodb.net:27017/hersafety?ssl=true&authSource=admin&retryWrites=true&w=majority";
        console.log("📡 Attempting PIN-POINT Neural Link with MongoDB...");
        const conn = await mongoose.connect(dbUri, options);
        console.log(`✅ MongoDB SUCCESS: Link Stable [${conn.connection.host}]`);
    } catch (e) {
        console.error("❌ Neural Link CRITICAL:", e.message);
        setTimeout(connectDB, 8000); 
    }
};

mongoose.connection.on('disconnected', () => {
    if (mongoose.connection.readyState === 0) {
        console.warn("🚨 DATABASE DROPPED: Emergency Neural Re-Link...");
        setTimeout(connectDB, 3000);
    }
});

connectDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 NEURAL CORE ONLINE [PORT: ${PORT}]`);
});
