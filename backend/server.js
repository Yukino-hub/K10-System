const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const db = require('./db'); // This imports your MySQL connection

const app = express();
const PORT = 5000;

// --- 1. Middleware ---
app.use(cors()); // Allows your frontend to talk to this server
app.use(express.json()); // Allows the server to read JSON data from requests

// --- 2. Test Route ---
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online and Connected to Docker MySQL!');
});

// --- 3. Staff Registration Route ---
// This is where you create new staff accounts
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // A. Hash the password (never store plain text!)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // B. Insert into MySQL
    const [result] = await db.execute(
      'INSERT INTO staff (username, password_hash) VALUES (?, ?)',
      [username, hashedPassword]
    );

    res.status(201).json({ message: 'Staff member registered successfully!' });
  } catch (error) {
    // Handle the case where the username is already taken
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'This username is already taken.' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Database connection error.' });
    }
  }
});

const jwt = require('jsonwebtoken');

// --- STAFF LOGIN ROUTE ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Check if user exists
    const [users] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = users[0];

    // 2. Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    // 3. Create a Digital Key (JWT)
    // In a real app, put 'your_jwt_secret' in a .env file!
    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      'your_jwt_secret', 
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

// --- ADD NEW CARD TO INVENTORY ---
app.post('/api/inventory/add', async (req, res) => {
  const { card_id, card_name, set_name, rarity, price, stock_quantity } = req.body;

  try {
    const [result] = await db.execute(
      'INSERT INTO inventory (card_id, card_name, set_name, rarity, price, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)',
      [card_id, card_name, set_name, rarity, price, stock_quantity]
    );

    res.status(201).json({ message: 'Card added to inventory!', id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add card to inventory' });
  }
});

// --- 4. Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});