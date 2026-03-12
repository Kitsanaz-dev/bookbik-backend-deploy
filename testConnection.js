require('dotenv').config();
const mongoose = require('mongoose');

const testConnection = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected successfully');
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
    }
}

testConnection();