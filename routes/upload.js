const express = require('express');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Use memory storage to process with sharp before saving
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for raw upload
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error("Only images (jpeg, jpg, png, webp) are allowed."));
    }
});

// POST /api/upload — Single file upload with optimization
router.post('/', authenticate, upload.single('image'), async (req, res) => {
    try {
        console.log('Upload Request Headers:', req.headers);
        console.log('Upload Request File:', req.file);

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        const filename = `img-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
        const outputPath = path.join(__dirname, '../uploads', filename);

        // Optimize image: resize to max 1200px width, convert to webp, compress
        await sharp(req.file.buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Construct the full URL.
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/uploads/${filename}`;

        res.json({
            success: true,
            message: 'File uploaded and optimized successfully',
            data: {
                url: fileUrl,
                filename: filename
            }
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
