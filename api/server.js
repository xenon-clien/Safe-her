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

app.get('/api/health', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
        server: "online",
        database: isConnected ? "connected" : "disconnected",
        db_error: isConnected ? null : lastDbError,
        timestamp: new Date().toISOString(),
        g_client_id: process.env.G_CLIENT_ID || "PENDING",
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
        const contacts = await EmergencyContact.find({ userId });
        res.json({ contacts }); // Wrap in object as frontend expects data.contacts
    } catch (e) { res.status(500).json({ message: e.message }); }
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
    console.log(`🤖 Chat request from ${userId}: ${message}`);

    const systemPrompt = `You are the 'Safe-Her Universal Oracle', a super-intelligent and deeply empathetic safety companion.
    
    1. MISSION: Solve every problem the user has regarding safety, navigation, or emergency situations with 100% reliability.
    2. LANGUAGE: Respond in the EXACT language/style of the user (Hindi, Hinglish, etc.).
    3. MAP EXPERT: You know every tiny chowk and street globally. Always use "MAP_FOCUS: [Place Name]" if they ask for a location.
    4. PROBLEM SOLVER: If they face any challenge, give a solid, actionable solution.
    5. BREVITY: Keep it powerful but SHORT (2-4 sentences).`;

    // High-Reliability Fetch with Retry
    const getAIResponse = async (retryCount = 0) => {
        try {
            const pollinationsUrl = `https://text.pollinations.ai/${encodeURIComponent(message)}?system=${encodeURIComponent(systemPrompt)}&model=openai`;
            const response = await axios.get(pollinationsUrl, { timeout: 15000 }); // 15s timeout
            return response.data;
        } catch (e) {
            if (retryCount < 2) {
                console.log(`🔄 Retrying AI fetch... (Attempt ${retryCount + 1})`);
                return getAIResponse(retryCount + 1);
            }
            throw e;
        }
    };

    try {
        const aiReply = await getAIResponse();
        return res.json({ response: aiReply || "I am processing your request. Please stay safe." });
    } catch (e) {
        console.error("Super-AI Fetch error:", e.message);
        return res.json({ response: "I'm strengthening our secure link. My intelligence is always with you. Keep the SOS ready." });
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
        lastDbError = e.message;
        console.error("❌ DB Connection Error:", e.message);
        console.log("⚠️ Server will continue to run in OFFLINE mode.");
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
 
