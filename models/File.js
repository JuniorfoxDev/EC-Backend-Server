const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    filename: String,
    contentType: String,
    length: Number,
    chunkSize: Number,
    uploadDate: Date,
    md5: String,
    url:String
});

const File = mongoose.model('File', FileSchema);

module.exports = File;