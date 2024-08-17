const mongoose = require('mongoose');
const { MongoClient, GridFSBucket } = require('mongodb');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const { Readable } = require('stream');
const path = require('path');
const serverless = require('serverless-http');

const app = express();
const saltRounds = 10;

// MongoDB URI
const mongoURI = "mongodb+srv://vaibhavmeshram2908:vaibhav123@cluster0.1pkf5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
    origin: 'https://ec-backend-client.vercel.app',
    methods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin']
}));
app.options('*', cors());
app.use('/files', express.static(path.join(__dirname, 'files')));

// Initialize database connection
let dbClient;
let bucket;

const connectDB = async () => {
    if (dbClient) return; // If already connected, do nothing

    try {
        dbClient = new MongoClient(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000
        });
        await dbClient.connect();
        const db = dbClient.db('test'); // Replace 'test' with your database name
        bucket = new GridFSBucket(db, { bucketName: 'uploads' });
        console.log('Database connected and GridFSBucket initialized.');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        throw new Error('Database connection failed');
    }
};

// Connect to MongoDB once at start
connectDB().catch(error => {
    console.error('Initial database connection failed:', error);
});

// Routes
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new User({ name, email, password: hashedPassword });
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Other routes follow similar patterns...

// Export the serverless function
module.exports.handler = serverless(app);
