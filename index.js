require('dotenv').config({ override: true });
const port = process.env.PORT || 3000;
const app = require('./app');
const connectDB = require('./config/database');

//Connect to MongoDB
connectDB();

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});