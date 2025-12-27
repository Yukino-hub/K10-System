require('dotenv').config(); // Load variables from .env if running locally
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); // This imports your Aiven MySQL connection

const app = express();

// Use Render's port or default to 5000 for local testing
const PORT = process.env.PORT || 5000;

// --- 1. Middleware ---
app.use(cors()); 
app.use(express.json()); 

// --- 2. Health Check Route ---
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online and Connected to Aiven Cloud MySQL!');
});

// --- 3. GET ALL CARDS FROM INVENTORY (Crucial for your Frontend!) ---
app.get('/api/inventory', async (req, res) => {
  try {
    const [cards] = await db.execute('SELECT * FROM inventory');
    res.json(cards);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// --- 4. Staff Registration Route ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const [result] = await db.execute(
      'INSERT INTO staff (username, password_hash) VALUES (?, ?)',
      [username, hashedPassword]
    );
    res.status(201).json({ message: 'Staff member registered successfully!' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'This username is already taken.' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Database connection error.' });
    }
  }
});

// --- 5. Staff Login Route ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ error: 'Invalid username or password' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });

    // Use the secret from Render Environment Variables
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '1h' }
    );

    res.json({
      message: 'Login successful!',
      token: token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- 6. Add Card Route ---
app.get('/api/inventory', async (req, res) => {
  try {
    const [cards] = await db.execute('SELECT * FROM inventory');
    res.json(cards);
  } catch (error) {
    // This will print the EXACT error to your Render Logs
    console.error("DATABASE ERROR:", error.message); 
    res.status(500).json({ error: 'Database error: ' + error.message });
  }
});

// --- 7. Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
