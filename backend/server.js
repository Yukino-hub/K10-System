const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json()); // Allows the server to read JSON data sent to it

// A simple "Route" (the first API endpoint)
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});