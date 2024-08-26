const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  description: String,
  sizes: [String],
  images: [{
    url: String,
    public_id: String,
    format: String,
    width: Number,
    height: Number,
  }],
  category: String,
  subcategory: String,
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
