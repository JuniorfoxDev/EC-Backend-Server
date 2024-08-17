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
const mongoURI =  "mongodb+srv://vaibhavmeshram2908:vaibhav123@cluster0.1pkf5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({
    origin: 'https://ec-backend-client.vercel.app', // Update this to match your client URL
    methods: ['POST', 'GET', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin']
}));
app.options('*', cors());
app.use('/files', express.static(path.join(__dirname, 'files')));

// Database connection
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

// Routes
app.post('/register', async (req, res) => {
    await connectDB();
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new User({ name, email, password: hashedPassword });
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Login route
app.post('/login', async (req, res) => {
    await connectDB();
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ message: "Invalid Password" });
        }
        res.json({ message: "Login successful" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// File upload route
app.post('/upload', upload.array('images'), async (req, res) => {
    await connectDB();
    const files = req.files;
    const { name, price, description, sizes } = req.body;

    if (!files || files.length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    try {
        const filePromises = files.map(file => {
            return new Promise((resolve, reject) => {
                const uploadStream = bucket.openUploadStream(file.originalname, {
                    contentType: file.mimetype
                });

                const readableStream = Readable.from(file.buffer);
                readableStream.pipe(uploadStream);

                uploadStream.on('finish', () => {
                    resolve({
                        _id: uploadStream.id,
                        filename: file.originalname,
                        contentType: file.mimetype,
                        length: file.size,
                        url: `http://localhost:3001/files/${uploadStream.filename}`
                    });
                });

                uploadStream.on('error', reject);
            });
        });

        const filesData = await Promise.all(filePromises);

        const filesToSave = filesData.map(fileData => new File(fileData));

        const savedFiles = await Promise.all(filesToSave.map(file => file.save()));

        const newProduct = new Product({
            name,
            price,
            description,
            sizes: Array.isArray(sizes) ? sizes : [sizes],
            images: savedFiles
        });

        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all products route
app.get('/products', async (req, res) => {
    await connectDB();
    try {
        const products = await Product.find().exec();
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get single product route
app.get('/products/:id', async (req, res) => {
    await connectDB();
    const { id } = req.params;
    try {
        const product = await Product.findById(id).exec();
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update product route
app.put('/products/:id', upload.array('images'), async (req, res) => {
    await connectDB();
    const { id } = req.params;
    
    const updateFields = {}; 
    if (req.body.name !== undefined) {
        updateFields.name = req.body.name;
    }
    if (req.body.price !== undefined && req.body.price !== '') {
        const price = parseFloat(req.body.price);
        if (!isNaN(price)) {
            updateFields.price = price;
        } else {
            return res.status(400).json({ message: 'Invalid price value' });
        }
    }
    if (req.body.description !== undefined) {
        updateFields.description = req.body.description;
    }
    if (req.body.sizes) {
        updateFields.sizes = Array.isArray(req.body.sizes) ? req.body.sizes : [req.body.sizes];
    }
    try {
        if (req.files && req.files.length > 0) {
            const filePromises = req.files.map(file => {
                return new Promise((resolve, reject) => {
                    const uploadStream = bucket.openUploadStream(file.originalname, {
                        contentType: file.mimetype,
                    });

                    const readableStream = Readable.from(file.buffer);
                    readableStream.pipe(uploadStream);

                    uploadStream.on('finish', () => {
                        resolve({
                            _id: uploadStream.id,
                            filename: file.originalname,
                            contentType: file.mimetype,
                            length: file.size,
                            url: `http://localhost:3001/files/${uploadStream.filename}`,
                        });
                    });

                    uploadStream.on('error', reject);
                });
            });

            const filesData = await Promise.all(filePromises);

            const filesToSave = filesData.map(fileData => new File(fileData));

            const savedFiles = await Promise.all(filesToSave.map(file => file.save()));

            updateFields.images = savedFiles;
        }

        const updatedProduct = await Product.findByIdAndUpdate(id, updateFields, {
            new: true, 
            runValidators: false, 
        });

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json(updatedProduct);
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete product route
app.delete('/products/:id', async (req, res) => {
    await connectDB();
    const { id } = req.params;
    try {
        await Product.deleteOne({ _id: id });
        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Export the serverless function
module.exports.handler = serverless(app);
