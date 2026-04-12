console.log("📁 Server file loaded...");
const path = require('path');
const express = require('express');
console.log("📦 Express loaded");
const mongoose = require('mongoose');
console.log("📦 Mongoose loaded");
const cors = require('cors');
console.log("📦 Cors loaded");
const Razorpay = require('razorpay');
console.log("📦 Razorpay loaded");
const crypto = require('crypto');
console.log("📦 Crypto loaded");
const { OAuth2Client } = require('google-auth-library');
console.log("📦 Google Auth loaded");
const twilio = require('twilio');
console.log("📦 Twilio loaded");
const AWS = require('aws-sdk');
console.log("📦 AWS loaded");
const axios = require('axios');
console.log("📦 Axios loaded");
const { Queue, Worker } = require('bullmq');
console.log("📦 BullMQ loaded");
const IORedis = require('ioredis');
console.log("📦 IORedis loaded");
console.log("📦 All modules loaded");

// --- Configuration Loader ---
const rootPath = path.join(__dirname, '..');
console.log("📂 Root path:", rootPath);
require('dotenv').config({ path: path.join(rootPath, '.env') }); 
console.log("⚙️ Dotenv loaded");

// Initialize Express App
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Redis & Queue Setup (with fallback for local dev without Redis)
let redisConn = null;
let sosQueue = { add: async (name, data) => { 
    console.log("⚠️ REDIS OFFLINE: Processing Task Synchronously..."); 
    if (name === 'send_sms') {
        const dummyJob = { data };
        if (typeof smsWorkerLogic === 'function') await smsWorkerLogic(dummyJob);
    }
}};

if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    try {
        redisConn = new IORedis(process.env.REDIS_URL, { 
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
            connectTimeout: 1000
        });
        redisConn.on('error', (err) => {
            console.warn("⚠️ Redis unavailable. Falling back to sync mode.");
            redisConn = null;
        });
        sosQueue = new Queue('sos_alerts', { connection: redisConn });
    } catch (e) {
        console.warn("⚠️ Redis Initialization Failed.");
    }
}

// Import Models
const User = require('./models/User');
const EmergencyContact = require('./models/EmergencyContact');
const Alert = require('./models/Alert');
const DangerZone = require('./models/DangerZone');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID || 'rzp_test_SaxSkQwrcuFvNW',
    key_secret: process.env.RZP_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8'
});

// Initialize Google OAuth Client
const googleClient = new OAuth2Client(process.env.G_CLIENT_ID);

// Initialize Twilio
const twilioClient = process.env.TWILIO_SID ? twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN) : null;

// Initialize AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});

// --- ROUTES ---

app.get('/api/health', (req, res) => {
    res.json({
        server: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
        g_client_id: process.env.G_CLIENT_ID || "PENDING"
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
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await user.matchPassword(password))) return res.status(401).json({ message: "Invalid credentials" });
        res.json({ user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/sos-trigger', async (req, res) => {
    try {
        const { userId, lat, lng } = req.body;
        const user = await User.findById(userId);
        const contacts = await EmergencyContact.find({ userId });
        const alertText = `🚨 SOS EMERGENCY: ${user?.name || 'User'} needs help! 📍 Location: https://maps.google.com/?q=${lat},${lng}`;
        await sosQueue.add('send_sms', { contacts: contacts.map(c => c.contactPhone), message: alertText, userName: user?.name });
        res.json({ message: "SOS Distributed", address: "Real-time Location Sent" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Google Login Verification
app.post('/api/google-login-verify', async (req, res) => {
    try {
        const { token } = req.body;
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.G_CLIENT_ID || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com"
        });
        const payload = ticket.getPayload();
        const { email, name, sub } = payload;

        let user = await User.findOne({ email });
        if (!user) {
            // Create a new user if not exists
            user = new User({
                name,
                email,
                password: crypto.randomBytes(16).toString('hex'), // Random password for social login
                phone: "PENDING"
            });
            await user.save();
        }

        res.json({ user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) {
        console.error("Google verify error:", e);
        res.status(401).json({ message: "Google Auth Failed" });
    }
});

// --- NEW REACHABLE ENDPOINTS ---

// Emergency Contacts
app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;
        if (!userId || !contactName || !contactPhone) return res.status(400).json({ message: "Missing required fields" });
        const newContact = new EmergencyContact({ userId, contactName, contactPhone });
        await newContact.save();
        res.status(201).json({ message: "Contact Saved Successfully", contact: newContact });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/get-contacts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const contacts = await EmergencyContact.find({ userId });
        res.json(contacts);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/delete-contact/:id', async (req, res) => {
    try {
        await EmergencyContact.findByIdAndDelete(req.params.id);
        res.json({ message: "Contact Deleted" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Danger Zones (Ludhiana Centric)
app.get('/api/danger-zones', async (req, res) => {
    try {
        const zones = await DangerZone.find();
        if (zones.length === 0) {
            // Seeding fallback if DB is empty
            return res.json([
                { name: "Dhandari Kalan Area", lat: 30.8690, lng: 75.9189, radius: 400, risk: "High", type: "Theft/Snatching" },
                { name: "Sherpur Industrial Belt", lat: 30.8931, lng: 75.8893, radius: 500, risk: "High", type: "Low Light/Industrial" }
            ]);
        }
        res.json(zones);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/safety-score', (req, res) => {
    // Semi-dynamic score logic
    const hour = new Date().getHours();
    let score = 8.5;
    let label = "SAFE";
    
    if (hour > 20 || hour < 5) {
        score = 6.2;
        label = "MODERATE RISK";
    }
    res.json({ score, label, timestamp: new Date() });
});

const { GoogleGenerativeAI } = require("@google/generative-ai");

// AI Chat Assistant (Real Google Gemini Integration)
app.post('/api/chat', async (req, res) => {
    try {
        const { message, userId } = req.body;
        console.log(`🤖 Chat request from ${userId}: ${message}`);

        const apiKey = process.env.GEMINI_API_KEY;
        
        if (apiKey && apiKey !== "PENDING") {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            
            const prompt = `You are the Safe-Her AI assistant, a professional and empathetic security companion for women. 
            User message: "${message}". 
            Context: The user is currently using the Safe-Her app. Provide a short, helpful, and safety-focused response (max 2-3 sentences). 
            If they are in danger, advise using the SOS button.`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();
            return res.json({ response });
        }

        // SIMULATED SMART RESPONSE (Fallback if No API Key)
        let response = "I'm your Safe-Her AI assistant. ";
        const msg = message.toLowerCase();
        
        if (msg.includes("help") || msg.includes("unsafe") || msg.includes("scared")) {
            response += "I sense you might be feeling unsafe. Please consider using the SOS button or moving to a well-lit area. Should I track your location more closely?";
        } else if (msg.includes("where") || msg.includes("location")) {
            response += "I can help you find safe routes. Use the Route Planner section to navigate safely.";
        } else {
            response += "Stay alert and keep your phone charged. I'm here to ensure your safety with real-time monitoring.";
        }

        res.json({ response });
    } catch (e) {
        console.error("Gemini Error:", e);
        res.status(500).json({ message: "AI Assistant is resting. Please try again in a moment." });
    }
});

// --- WORKER LOGIC ---
const smsWorkerLogic = async job => {
    console.log(`🚀 SOS TASK: ${job.data.userName}`);
    if (twilioClient) {
        for (const phone of job.data.contacts) {
            await twilioClient.messages.create({ body: job.data.message, from: process.env.TWILIO_PHONE, to: phone }).catch(e => console.error(e));
        }
    } else {
        console.log("SIMULATED SMS:", job.data.message);
    }
};

if (redisConn) new Worker('sos_alerts', smsWorkerLogic, { connection: redisConn });

// --- SERVE FRONTEND (STATIC FILES) ---
// Placing this at the end ensures API routes take precedence
app.use(express.static(path.join(__dirname, '..')));

// Start Server
const PORT = process.env.PORT || 5000;

console.log("📍 Attempting to connect to Database...");
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hersafety')
    .then(() => {
        console.log("✅ Database Connected Successfully");
    })
    .catch(e => {
        console.error("❌ DB Connection Error:", e.message);
        console.log("⚠️ Server will continue to run in OFFLINE mode.");
    });

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 ==========================================
🚀 SERVER ONLINE: HerSafety v1.0.0
🚀 URL: http://localhost:${PORT}
🚀 FRONTEND: Serving static files from root
🚀 ==========================================
    `);
});

module.exports = app;
