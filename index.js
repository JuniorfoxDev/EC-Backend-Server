const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { MongoClient, GridFSBucket } = require('mongodb');
const bcrypt = require('bcrypt');
const { Readable } = require('stream');
const path = require('path');

const saltRounds = 10;
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.options('*', cors()); 
app.get('/', (req, res) => {
    res.json('hello');
});

// Serve static files
app.use('/files', express.static(path.join(__dirname, 'files')));

// MongoDB URI
const mongoURI = process.env.MONGO_URI || "mongodb+srv://vaibhavmeshram2908:vaibhav123@cluster0.1pkf5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    bufferCommands: false // Disable buffering
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(error => {
    console.error('Error connecting to MongoDB:', error);
});

// Models
const User = require('./models/Register');
const Product = require('./models/Product');
const File = require('./models/File');

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Connect to MongoDB using MongoClient and GridFSBucket
const client = new MongoClient(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000
});

let bucket;
client.connect().then(() => {
    const db = client.db('test'); // Replace 'test' with your database name
    bucket = new GridFSBucket(db, { bucketName: 'uploads' });
    console.log('Connected to MongoDB and GridFSBucket initialized.');
}).catch(error => {
    console.error('Error connecting to MongoDB:', error);
});

// Register route
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = new User({ name, email, password: hashedPassword });
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (error) {
        console.error('Error in /api/register:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login route
app.post('/api/login', async (req, res) => {
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
        console.error('Error in /api/login:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// File upload route
app.post('/api/upload', upload.array('images'), async (req, res) => {
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
                        url: `https://ec-backend-server.vercel.app/files/${uploadStream.filename}` // Update to your Vercel domain
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
        console.error('Error in /api/upload:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all products route
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().exec();
        res.json(products);
    } catch (error) {
        console.error('Error in /api/products:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get single product route
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const product = await Product.findById(id).exec();
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }
        res.json(product);
    } catch (error) {
        console.error('Error in /api/products/:id:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update product route
app.put('/api/products/:id', upload.array('images'), async (req, res) => {
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
                            url: `https://ec-backend-server.vercel.app/files/${uploadStream.filename}`, // Update to your Vercel domain
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
            runValidators: false
        });

        if (!updatedProduct) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json(updatedProduct);
    } catch (error) {
        console.error('Error in /api/products/:id (PUT):', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// File retrieval route
app.get('/files/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const file = await bucket.find({ filename }).toArray();

        if (!file || file.length === 0) {
            return res.status(404).json({ message: "File not found" });
        }

        const downloadStream = bucket.openDownloadStreamByName(filename);

        downloadStream.on('data', (chunk) => {
            res.write(chunk);
        });

        downloadStream.on('error', (err) => {
            console.error('Error streaming file:', err);
            res.sendStatus(404);
        });

        downloadStream.on('end', () => {
            res.end();
        });
    } catch (error) {
        console.error('Error in /files/:filename:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete product route
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const product = await Product.findByIdAndDelete(id);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // Delete associated images
        await File.deleteMany({ _id: { $in: product.images } });

        res.json({ message: "Product deleted successfully" });
    } catch (error) {
        console.error('Error in /api/products/:id (DELETE):', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Export the app for Vercel
module.exports = app;
