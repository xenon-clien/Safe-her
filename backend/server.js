const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import Models
const User = require('./models/User');
const EmergencyContact = require('./models/EmergencyContact');
const Alert = require('./models/Alert');

const app = express();
const PORT = 5000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/hersafety')

    .then(() => console.log('✅ Connected to MongoDB locally (Database: hersafety)'))
    .catch(err => console.error('❌ Failed to connect to MongoDB', err));

// =======================
// REST APIs
// =======================

// 1. Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;

        // Check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User with this email already exists" });
        }

        const newUser = new User({ name, email, password, phone });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully", userId: newUser._id });
    } catch (error) {
        console.error("Register Error:", error);
        if (error.code === 11000) {
            return res.status(400).json({ message: "This email is already registered!" });
        }
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
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
});

// 3. Add Emergency Contact
app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;

        const contact = new EmergencyContact({
            userId,
            contactName,
            contactPhone
        });

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
        res.status(201).json({ message: "Alert sent successfully", alertId: alert._id });
    } catch (error) {
        res.status(500).json({ message: "Error sending alert", error: error.message });
    }
});

// 5. Get Alert History
app.get('/api/alerts/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });

        res.status(200).json({ message: "Alerts retrieved", count: alerts.length, alerts });
    } catch (error) {
        res.status(500).json({ message: "Error fetching alerts", error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Safety Server running on http://localhost:${PORT}`);
});
