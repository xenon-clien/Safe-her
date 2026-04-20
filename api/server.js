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
// const AWS = require('aws-sdk');
// console.log("📦 AWS loaded");
const axios = require('axios');
console.log("📦 Axios loaded");
const { GoogleGenerativeAI } = require("@google/generative-ai");
console.log("📦 Gemini AI loaded");
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
app.use(cors({ origin: true, credentials: true }));

// --- Neural Traffic Monitor ---
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url} - (DB State: ${mongoose.connection.readyState})`);
    next();
});

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

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Initialize AWS S3 (Commented out until needed)
/*
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});
*/

// --- ROUTES ---

let lastDbError = null;
let isConnecting = false;

mongoose.connection.on('connected', () => {
    console.log("✅ MongoDB Connection Established");
    lastDbError = null;
});

mongoose.connection.on('error', (err) => {
    console.error("❌ MongoDB Error:", err.message);
    lastDbError = err.message;
});

mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ MongoDB Disconnected. Auto-Healer initiated...");
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('reconnected', () => {
    console.log("✅ MongoDB Connection Restored: Neural Link Stable");
    lastDbError = null;
});

app.get('/api/health', (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const readyState = mongoose.connection.readyState;
    
    res.json({
        server: "online",
        database: states[readyState] || "unknown",
        db_error: lastDbError,
        last_error: lastDbError,
        timestamp: new Date().toISOString(),
        gemini_key_status: process.env.GEMINI_API_KEY ? "CONFIGURED ✅" : "MISSING ❌"
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
        email = email.toLowerCase().trim();
        
        console.log(`🔑 Login Attempt: ${email}`);
        
        const user = await User.findOne({ email });
        if (!user) {
            console.log(`❌ Login Failed: User not found (${email})`);
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            console.log(`❌ Login Failed: Password mismatch for ${email}`);
            return res.status(401).json({ message: "Invalid credentials" });
        }

        console.log(`✅ Login Success: ${email}`);
        res.json({ user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) { 
        console.error("Login Error:", e);
        res.status(500).json({ message: e.message }); 
    }
});

app.post('/api/sos-trigger', async (req, res) => {
    try {
        const { userId, lat, lng } = req.body;
        if (!userId) return res.status(400).json({ message: "UserId is missing" });
        const user = await User.findById(userId);
        const contacts = await EmergencyContact.find({ userId });
        const alertText = `🚨 SOS EMERGENCY: ${user?.name || 'User'} needs help! 📍 Location: https://maps.google.com/?q=${lat},${lng}`;
        await sosQueue.add('send_sms', { contacts: contacts.map(c => c.contactPhone), message: alertText, userName: user?.name });
        res.json({ message: "SOS Distributed", address: "Real-time Location Sent" });
    } catch (e) { 
        console.error("SOS Trigger Error:", e.message);
        res.status(500).json({ message: "Failed to process SOS: " + e.message }); 
    }
});

// Google Login Verification
app.post('/api/google-login-verify', async (req, res) => {
    try {
        const { token } = req.body;
        console.log("🔐 Verifying Google Token for audience:", process.env.G_CLIENT_ID);
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.G_CLIENT_ID || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com"
        });
        const payload = ticket.getPayload();
        console.log("✅ Token Verified for:", payload.email);
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
        res.status(401).json({ message: "Google Auth Failed: " + e.message });
    }
});

// Fallback Google Social Sync (When native GSI fails)
app.post('/api/google-social-sync', async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        let user = await User.findOne({ email });
        if (!user) {
            user = new User({
                name,
                email,
                password: crypto.randomBytes(16).toString('hex'),
                phone: "Google Synced"
            });
            await user.save();
        }

        console.log("🔄 Social Sync successful for:", email);
        res.json({ message: "Sync Successful", user: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
    } catch (e) {
        console.error("Social Sync error:", e);
        res.status(500).json({ message: "Internal Sync Error" });
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
        if (!userId || userId === 'undefined') return res.json({ contacts: [] });
        const contacts = await EmergencyContact.find({ userId });
        res.json({ contacts: contacts || [] }); 
    } catch (e) { 
        console.error("Get Contacts Error:", e.message);
        res.status(500).json({ message: e.message }); 
    }
});

app.delete('/api/delete-contact/:id', async (req, res) => {
    try {
        await EmergencyContact.findByIdAndDelete(req.params.id);
        res.json({ message: "Contact Deleted" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Digital Blackbox (Audio Evidence Upload)
app.post('/api/blackbox-upload', async (req, res) => {
    try {
        const { userId, chunkData, filename } = req.body;
        console.log(`🔒 Received Blackbox chunk for user ${userId}: ${filename}`);
        // In simulation, we just acknowledge receipt. 
        // Real implementation would save to S3 or local storage.
        res.json({ status: "secured", message: "Chunk stored in encrypted vault." });
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

// AI Chat Assistant (Super-Solid Universal Safety Oracle)
app.post('/api/chat', async (req, res) => {
    const { message, userId } = req.body;
    console.log(`🤖 Gemini Chat request from ${userId}: ${message}`);

    const systemPrompt = `You are "The Oracle", a highly advanced AI safety assistant inspired by Alexa but built for extreme security.
    
    TONE & PERSONALITY:
    - Calm, authoritative but deeply supportive.
    - Use natural Hinglish (bol-chaal ki bhasha). 
    - You are the user's "Guardian Shadow". If connection is weak, say: "Connection fluctuate ho raha hai, par main aapke saath hoon. Chinta na karein, bas kisi safe jagah par hon."
    
    CORE PROTOCOLS:
    1. SOS: Respond with "SOS_TRIGGER" if danger is detected.
    2. TRACKING: Respond with "START_TRACKING" to begin live sync.
    3. FAKE CALL: Respond with "FAKE_CALL_TRIGGER" to simulate a decoy call.
    4. MAP: Use "MAP_FOCUS: [Place]" to re-center the map.
    5. SAFETY: Always check if the current area or score is concerning.
    
    LANGUAGE RULE: Use simple Hinglish (e.g., "Aap bilkul safe hain", "Main rasta check kar rahi hoon"). 
    BREVITY: Maximum 2 small sentences.`;

    try {
        if (!message || message.trim() === "") {
            return res.json({ response: "I'm listening. How can the Oracle help you stay safe tonight?" });
        }

        if (!genAI) {
            throw new Error("Gemini API not configured");
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", // Using 1.5 Flash for maximum availability and speed
            systemInstruction: systemPrompt 
        });

        const result = await model.generateContent(message);
        const aiReply = result.response.text();
        
        return res.json({ response: aiReply || "I am processing your request. Please stay safe." });
    } catch (e) {
        console.error("Gemini Chat Error:", e.message);
        return res.json({ response: "Connection fluctuate ho raha hai, par main aapke saath hoon. Koshish karein ki aap kisi safe jagah par hon." });
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

const connectDB = async () => {
    if (isConnecting || mongoose.connection.readyState === 1) return;
    
    isConnecting = true;
    try {
        console.log("📍 Neural Link: Attempting to synchronize with Atlas Cluster...");
        const options = {
            serverSelectionTimeoutMS: 20000,
            heartbeatFrequencyMS: 2000,
            socketTimeoutMS: 45000,
            bufferCommands: false,
            family: 4 
        };
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hersafety', options);
        console.log("✅ Neural Link: Synchronization Successful");
        lastDbError = null;
    } catch (e) {
        console.error("📛 Neural Link: Synchronization Failed!", e.message);
        lastDbError = e.message;
        // Retry after 5 seconds
        setTimeout(connectDB, 5000);
    } finally {
        isConnecting = false;
    }
};

connectDB();

mongoose.connection.on('disconnected', () => {
    console.warn("⚠️ Neural Link: Connection Severed. Retrying in 5s...");
    setTimeout(connectDB, 5000);
});

// --- PREMIUM & PAYMENT INFRASTRUCTURE ---
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, currency } = req.body;
        // Mocking Razorpay Order for Simulator
        const orderId = "order_" + crypto.randomBytes(8).toString('hex');
        res.json({ id: orderId, amount: (amount || 1) * 100, currency: currency || "INR" });
    } catch (e) {
        res.status(500).json({ message: "Order creation failed" });
    }
});

app.post('/api/request-otp', async (req, res) => {
    const { email, phone } = req.body;
    // Generate RANDOM 6-digit OTP
    const dynamic_otp = Math.floor(100000 + Math.random() * 900000).toString();
    const payment_id = "pay_" + crypto.randomBytes(8).toString('hex');
    
    // In a real app, you'd store this in Redis or DB. For now, we'll send it back in the response.
    // The simulator will 'read' this OTP to show the user.
    res.json({ 
        status: 'success', 
        payment_id, 
        dev_otp: dynamic_otp, 
        maskedPhone: phone ? phone.replace(/(\d{2})\d{5}(\d{3})/, "$1*****$2") : "+91 ***** *****" 
    });
});

app.post('/api/verify-otp', async (req, res) => {
    const { otp, email, expectedOtp } = req.body;
    // Comparison logic
    if (otp === expectedOtp) {
        res.json({ status: "success", message: "Verification Successful" });
    } else {
        res.status(400).json({ status: "error", message: "Invalid Security Code" });
    }
});

app.listen(PORT, () => {
    console.log(`
🚀 ==========================================
🚀 SERVER ONLINE: HerSafety v1.0.0
🚀 URL: http://localhost:5000
🚀 FRONTEND: Serving static files from root
🚀 ==========================================
    `);
});

module.exports = app;
 
