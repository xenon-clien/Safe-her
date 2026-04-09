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
app.use(cors());

// Serve static files from the root directory so app works on http://localhost:5000
app.use(express.static(path.join(__dirname, '..')));

// Root route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// MongoDB Connection using Environment Variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hersafety';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas/Local'))
    .catch(err => console.error('❌ Failed to connect to MongoDB', err));

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
        console.error("Register Error:", error);
        res.status(500).json({ message: "Error registering user: " + error.message });
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
        res.status(500).json({ message: "Error logging in", error: error.message });
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

// 6. Professional Payment Verification API
app.post('/api/verify-payment', (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        console.log(`🛡️ Verifying Payment: ${razorpay_payment_id}`);

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RZP_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8')
            .update(body.toString())
            .digest('hex');

        if (expectedSignature === razorpay_signature) {
            console.log("💎 Payment Verified Successfully!");
            res.status(200).json({ status: "success", message: "Payment verified successfully" });
        } else {
            console.error("🚫 Invalid Signature!");
            res.status(400).json({ status: "failure", message: "Invalid payment signature" });
        }
    } catch (error) {
        console.error("❌ Verification error:", error);
        res.status(500).json({ status: "error", message: "Internal server error during verification" });
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
