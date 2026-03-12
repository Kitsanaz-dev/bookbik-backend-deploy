const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const PosCategory = require('../models/PosCategory');
const PosProduct = require('../models/PosProduct');

// All routes require authentication
router.use(authenticate);

// --- CATEGORIES ---

// GET /api/pos/categories?business_id=xxx
router.get('/categories', async (req, res) => {
    try {
        const { business_id } = req.query;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

        const categories = await PosCategory.find({ business_id, isActive: true }).sort({ name: 1 });
        res.json({ success: true, data: categories, count: categories.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
    }
});

// GET /api/pos/categories/:id
router.get('/categories/:id', async (req, res) => {
    try {
        const category = await PosCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching category', error: error.message });
    }
});

// POST /api/pos/categories
router.post('/categories', authorize('owner', 'admin'), async (req, res) => {
    try {
        const category = new PosCategory(req.body);
        const saved = await category.save();
        res.status(201).json({ success: true, message: 'Category created successfully', data: saved });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Category name already exists for this business' });
        }
        res.status(400).json({ success: false, message: 'Error creating category', error: error.message });
    }
});

// PUT /api/pos/categories/:id
router.put('/categories/:id', authorize('owner', 'admin'), async (req, res) => {
    try {
        const category = await PosCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category updated successfully', data: category });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating category', error: error.message });
    }
});

// DELETE /api/pos/categories/:id (soft delete)
router.delete('/categories/:id', authorize('owner', 'admin'), async (req, res) => {
    try {
        const productCount = await PosProduct.countDocuments({ category: req.params.id, isActive: true });
        if (productCount > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete. ${productCount} products use this category.` });
        }
        const category = await PosCategory.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting category', error: error.message });
    }
});

// --- PRODUCTS ---

// GET /api/pos/products?business_id=xxx
router.get('/products', async (req, res) => {
    try {
        const { business_id, search, category, lowStock, isActive = true, limit = 50, page = 1 } = req.query;
        if (!business_id) return res.status(400).json({ success: false, message: 'business_id is required' });

        let query = { business_id, isActive: isActive === 'false' ? false : true };
        if (category) query.category = category;
        if (lowStock === 'true') query.stock = { $lt: 10 };

        const skip = (page - 1) * limit;
        let products;

        if (search) {
            // Use regex search since text index is compound with business_id
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        products = await PosProduct.find(query)
            .populate('category', 'name color')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip);

        res.json({ success: true, data: products, count: products.length });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
    }
});

// GET /api/pos/products/:id
router.get('/products/:id', async (req, res) => {
    try {
        const product = await PosProduct.findById(req.params.id).populate('category', 'name color');
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching product', error: error.message });
    }
});

// POST /api/pos/products
router.post('/products', authorize('owner', 'admin'), async (req, res) => {
    try {
        const product = new PosProduct(req.body);
        const saved = await product.save();
        res.status(201).json({ success: true, message: 'Product created successfully', data: saved });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating product', error: error.message });
    }
});

// PUT /api/pos/products/:id
router.put('/products/:id', authorize('owner', 'admin'), async (req, res) => {
    try {
        const product = await PosProduct.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product updated successfully', data: product });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating product', error: error.message });
    }
});

// PATCH /api/pos/products/:id/stock
router.patch('/products/:id/stock', async (req, res) => {
    try {
        const { stock, operation } = req.body;
        const product = await PosProduct.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        if (operation === 'add') {
            product.stock += parseInt(stock);
        } else {
            product.stock = parseInt(stock);
        }
        const updated = await product.save();
        res.json({ success: true, message: 'Stock updated', data: updated });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating stock', error: error.message });
    }
});

// DELETE /api/pos/products/:id (soft delete)
router.delete('/products/:id', authorize('owner', 'admin'), async (req, res) => {
    try {
        const product = await PosProduct.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
    }
});

module.exports = router;
