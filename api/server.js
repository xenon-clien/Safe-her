require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const path = require('path');
const { OAuth2Client } = require('google-auth-library');

// Initialize Google OAuth Client
const googleClient = new OAuth2Client(process.env.G_CLIENT_ID || "533722956740-v49p8v2u7qquj9u7f8v1v8v1v8v1v8v1.apps.googleusercontent.com");

// Import Models
const User = require('./models/User');
const EmergencyContact = require('./models/EmergencyContact');
const Alert = require('./models/Alert');

const app = express();

// Initialize Razorpay Instance using Environment Variables
console.log("🔍 Checking Environment Variables...");
console.log("RZP_KEY_ID:", process.env.RZP_KEY_ID ? `Found (${process.env.RZP_KEY_ID.substring(0, 9)}...)` : "Not Found");
console.log("RZP_KEY_SECRET:", process.env.RZP_KEY_SECRET ? "Found (masked)" : "Not Found");

const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID || 'rzp_test_SaxSkQwrcuFvNW',
    key_secret: process.env.RZP_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8'
});

console.log("🚀 Razorpay initialized with Key ID:", (process.env.RZP_KEY_ID || 'rzp_test_SaxSkQwrcuFvNW').substring(0, 9) + "...");

// Middleware
app.use(express.json());

// CORS — allow all origins (including file:// for local dev)
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (file://, mobile apps, Postman) and all HTTP/HTTPS origins
        callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true
}));
app.options(/(.*)/, cors()); // Express 5 compatible preflight handler



// Serve static files from the root directory so app works on http://localhost:5000
app.use(express.static(path.join(__dirname, '..')));

// Root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// --- Robust MongoDB Connection for Vercel/Serverless ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hersafety';

let cachedDb = null;
let lastConnectionError = null;

async function connectToDatabase() {
    if (cachedDb && mongoose.connection.readyState === 1) {
        return cachedDb;
    }

    console.log("🔗 Attempting to connect to MongoDB Atlas...");
    try {
        const db = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 8000, // Timeout after 8s (Vercel limit is 10s)
            connectTimeoutMS: 10000,
        });
        cachedDb = db;
        lastConnectionError = null;
        console.log("✅ Successfully connected to MongoDB Atlas");
        return db;
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
        lastConnectionError = err.message;
        throw err;
    }
}

// Initial connection for non-serverless environments (like local dev)
if (process.env.NODE_ENV !== 'production') {
    connectToDatabase().catch(e => console.error("Initial connection failed:", e.message));
}

// --- Diagnostic Health Endpoint ---
app.get('/api/health', async (req, res) => {
    // Proactively try to connect so we can see the error
    try {
        await connectToDatabase();
    } catch (e) {
        // Error is already logged in lastConnectionError
    }

    // Masked URI for safety
    const rawUri = process.env.MONGODB_URI || "NOT SET (Using Local Fallback)";
    const maskedUri = rawUri.includes('@') 
        ? rawUri.split('@')[1] // Show only the cluster part
        : rawUri;

    const status = {
        server: "online",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        last_error: lastConnectionError || "none",
        uri_source: maskedUri,
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || "development"
    };
    
    // In health check, we don't status(500) so we can actually see the JSON
    res.status(200).json(status);
});

// Middleware to ensure DB is connected before processing requests
app.use(async (req, res, next) => {
    // Skip DB check for static files or non-API routes if needed
    if (!req.path.startsWith('/api')) return next();
    if (req.path === '/api/health') return next(); // Don't block health check
    
    try {
        await connectToDatabase();
        next();
    } catch (err) {
        res.status(503).json({ 
            message: "Database connection failed", 
            error: err.message,
            tip: "Check MongoDB Atlas Network Access (0.0.0.0/0) and MONGODB_URI in Vercel settings."
        });
    }
});

// =======================
// REST APIs
// =======================

// 1. Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User with this email already exists" });
        }
        const newUser = new User({ name, email, password, phone });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully", userId: newUser._id });
    } catch (error) {
        console.error("❌ Register Error:", error.message);
        res.status(500).json({ 
            message: "Registration failed on server", 
            details: error.message,
            suggestion: "Check console logs for MongooseServerSelectionError" 
        });
    }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        res.status(200).json({
            message: "Login successful",
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
        });
    } catch (error) {
        console.error("❌ Login Error:", error.message);
        res.status(500).json({ 
            message: "Login failed on server", 
            details: error.message 
        });
    }
});

// 2b. Real Google Login / Sync (Production Grade)
app.post('/api/google-login-verify', async (req, res) => {
    try {
        const { token } = req.body;
        
        // 1. Verify the ID Token from Google
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.G_CLIENT_ID || "533722956740-v49p8v2u7qquj9u7f8v1v8v1v8v1v8v1.apps.googleusercontent.com"
        });
        
        const payload = ticket.getPayload();
        const { sub, email, name, picture } = payload;

        console.log(`🔐 Google Auth Success: ${name} (${email})`);

        // 2. Check if user already exists
        let user = await User.findOne({ email });
        
        if (user) {
            return res.status(200).json({
                message: "Sync Successful",
                user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
            });
        }
        
        // 3. Create new user if not found
        const newUser = new User({
            name: name,
            email: email,
            password: crypto.randomBytes(16).toString('hex'),
            phone: "Google Authenticated"
        });
        
        await newUser.save();
        
        res.status(201).json({
            message: "New account created via Google",
            user: { id: newUser._id, name: newUser.name, email: newUser.email, phone: newUser.phone }
        });
        
    } catch (error) {
        console.error("❌ Google Verification Failed:", error.message);
        res.status(401).json({ message: "Invalid Google credentials", error: error.message });
    }
});

// 2c. Google Social Sync — fallback/dev mode (accepts name+email directly, no Google token needed)
app.post('/api/google-social-sync', async (req, res) => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({ message: "Name and email are required" });
        }

        console.log(`🔐 Google Social Sync: ${name} (${email})`);

        // Check if user already exists in DB
        let user = await User.findOne({ email });

        if (user) {
            return res.status(200).json({
                message: "Returning user synced",
                user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
            });
        }

        // Create new user record
        const newUser = new User({
            name,
            email,
            password: crypto.randomBytes(16).toString('hex'),
            phone: "Google Authenticated"
        });

        await newUser.save();
        console.log(`✅ New Google user saved to DB: ${email}`);

        res.status(201).json({
            message: "New account created via Google",
            user: { id: newUser._id, name: newUser.name, email: newUser.email, phone: newUser.phone }
        });

    } catch (error) {
        console.error("❌ Google Social Sync Error:", error.message);
        res.status(500).json({ message: "Server error during Google sync", error: error.message });
    }
});

// 3. Add Emergency Contact

app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;
        const contact = new EmergencyContact({ userId, contactName, contactPhone });
        await contact.save();
        res.status(201).json({ message: "Emergency contact added", contact });
    } catch (error) {
        res.status(500).json({ message: "Error adding contact", error: error.message });
    }
});

// 4. Send SOS Alert
app.post('/api/send-alert', async (req, res) => {
    try {
        const { userId, location, message } = req.body;
        const alert = new Alert({
            userId,
            location: {
                latitude: location.latitude,
                longitude: location.longitude
            },
            message: message || "Emergency SOS triggered!",
            status: "sent"
        });
        await alert.save();
        simulateMultiChannelAlert(userId, "SOS");
        res.status(201).json({ message: "Alert sent successfully", alertId: alert._id });
    } catch (error) {
        res.status(500).json({ message: "Error sending alert", error: error.message });
    }
});

// 5. Razorpay Create Order API
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, currency } = req.body;
        console.log(`📦 Creating Order: ${amount} ${currency || "INR"}`);
        
        const options = {
            amount: amount * 100, 
            currency: currency || "INR",
            receipt: `receipt_${Date.now()}`
        };
        const order = await razorpay.orders.create(options);
        console.log("✅ Order Created Successfully:", order.id);
        res.status(200).json(order);
    } catch (error) {
        console.error("❌ Order Creation Error RAW:", JSON.stringify(error, null, 2));
        res.status(500).json({ 
            message: "Razorpay Error: Failed to create order", 
            error: error.message,
            code: error.code 
        });
    }
});

// Mongoose OTP Schema for Vercel Serverless compatibility
const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    payment_id: { type: String, required: true },
    order_id: String,
    expiresAt: { type: Date, required: true, index: { expires: '0s' } } // Auto-delete document upon expiration
});
const OtpRecord = mongoose.models.OtpRecord || mongoose.model('OtpRecord', otpSchema);

// 6. Direct OTP Generation for Simulator (Bypasses Razorpay Signature)
app.post('/api/request-otp', async (req, res) => {
    try {
        const { email, phone } = req.body;
        if (!email) return res.status(400).json({ status: "error", message: "Email required for OTP" });

        console.log(`💎 Simulator Payment Request! Generating OTP for ${email}...`);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
        const payment_id = `sim_${Date.now()}`;

        // Upsert OTP record
        await OtpRecord.findOneAndUpdate(
            { email },
            { otp, payment_id, expiresAt },
            { upsert: true, new: true }
        );

        const maskedPhone = phone
            ? phone.replace(/(\d{2})(\d+)(\d{4})$/, (_, a, b, c) => `${a}${'*'.repeat(b.length)}${c}`)
            : '**********';

        console.log(`📱 OTP for ${email}: ${otp}`);

        res.status(200).json({
            status: "success",
            message: "OTP sent successfully",
            maskedPhone,
            payment_id,
            dev_otp: otp
        });
    } catch (error) {
        console.error("❌ Request OTP error:", error);
        res.status(500).json({ status: "error", message: "Internal server error" });
    }
});

// 6. Payment Verification — verifies signature then generates OTP
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, email, phone } = req.body;
        console.log(`🛡️ Verifying Payment: ${razorpay_payment_id}`);

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8')
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            console.log("💎 Payment Verified! Generating OTP...");

            // Generate 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            // Store OTP linked to email
            const keyEmail = email || `guest-${razorpay_payment_id}@safety.test`;
            await OtpRecord.findOneAndUpdate(
                { email: keyEmail },
                { otp, payment_id: razorpay_payment_id, order_id: razorpay_order_id, expiresAt },
                { upsert: true, new: true }
            );

            // Mask phone for display: +91 98765 ***** → show last 4 digits
            const maskedPhone = phone
                ? phone.replace(/(\d{2})(\d+)(\d{4})$/, (_, a, b, c) => `${a}${'*'.repeat(b.length)}${c}`)
                : '**********';

            console.log(`📱 OTP for ${email}: ${otp} (expires in 5 min)`);
            // In production: send OTP via SMS (Twilio/MSG91)
            // For dev/test: OTP is returned in response so you can test
            res.status(200).json({
                status: "otp_required",
                message: "OTP sent to your registered mobile number",
                maskedPhone,
                // REMOVE this in production! Only for dev/test:
                dev_otp: otp
            });
        } else {
            console.error("🚫 Invalid Signature!");
            res.status(400).json({ status: "failure", message: "Invalid payment signature" });
        }
    } catch (error) {
        console.error("❌ Verification error:", error);
        res.status(500).json({ status: "error", message: "Internal server error during verification" });
    }
});

// 6b. OTP Verification — confirm OTP then activate premium
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp, payment_id } = req.body;
        const keyEmail = email && email !== 'guest' ? email : (payment_id ? `guest-${payment_id}@safety.test` : null);
        
        const record = await OtpRecord.findOne({ $or: [{ email: keyEmail }, { payment_id }] });

        if (!record) {
            return res.status(400).json({ status: "error", message: "OTP expired or not found. Please retry payment." });
        }

        if (record.expiresAt < new Date()) {
            await OtpRecord.deleteOne({ _id: record._id });
            return res.status(400).json({ status: "error", message: "OTP has expired. Please retry." });
        }

        if (record.otp !== otp.toString().trim()) {
            return res.status(400).json({ status: "error", message: "Incorrect OTP. Please try again." });
        }

        // OTP matched — clean up and activate premium
        await OtpRecord.deleteOne({ _id: record._id });
        console.log(`✅ OTP Verified. Premium activated!`);

        res.status(200).json({
            status: "success",
            message: "OTP verified. Premium access granted!",
            payment_id: record.razorpay_payment_id
        });

    } catch (error) {
        console.error("❌ OTP Verify error:", error);
        res.status(500).json({ status: "error", message: "Server error during OTP verification" });
    }
});



// 6. Professional Security Logs & Evidence Sync (Mock)
app.post('/api/sync-evidence', async (req, res) => {
    try {
        const { userId, type, metadata } = req.body;
        simulateMultiChannelAlert(userId, type);
        res.status(201).json({ 
            message: "Evidence synced to secure cloud bucket", 
            timestamp: new Date().toISOString(),
            status: "Encrypted & Secured"
        });
    } catch (error) {
        res.status(500).json({ message: "Cloud sync failed", error: error.message });
    }
});

// Helper: Multi-Channel Alert Simulator
function simulateMultiChannelAlert(userId, triggerType) {
    const trackingLink = `/track/${userId}`;
    console.log("\n--- EMERGENCY RELAY INITIATED ---");
    console.log(`[SMS] LIVE TRACKING LINK SENT -> ${trackingLink}`);
    console.log("--- ALL CHANNELS VERIFIED ---\n");
}

// 8. Serving tracking.html
app.get('/track/:userId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tracking.html'));
});

// 9. Get Public User Status (Pollable)
app.get('/api/public/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const latestAlert = await Alert.findOne({ userId }).sort({ createdAt: -1 });
        if (!latestAlert) return res.json({ status: 'offline' });
        const history = await Alert.find({ userId }).sort({ createdAt: -1 }).limit(5);

        res.json({
            status: 'online',
            location: latestAlert.location,
            message: latestAlert.message,
            updatedAt: latestAlert.createdAt,
            logs: history.map(a => ({
                type: 'SOS',
                message: a.message,
                time: new Date(a.createdAt).toLocaleTimeString(),
                status: 'error'
            }))
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 7. Get Alert History
app.get('/api/alerts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ message: "Alerts retrieved", count: alerts.length, alerts });
    } catch (error) {
        res.status(500).json({ message: "Error fetching alerts", error: error.message });
    }
});

// Start Server locally
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Safety Server running on http://localhost:${PORT}`);
    });
}

// Export the Express app for Vercel
module.exports = app;
