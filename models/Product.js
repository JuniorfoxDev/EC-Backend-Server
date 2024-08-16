const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    sizes:{type: [String], required: true},
    images: [{
        filename: String,
        id: mongoose.Schema.Types.ObjectId,
        url: String
    }]
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
