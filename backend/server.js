require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); // Ensure your db.js has the SSL settings we discussed

const app = express();

// --- 1. DYNAMIC PORT FOR RENDER ---
const PORT = process.env.PORT || 5000;

// --- 2. ADVANCED CORS CONFIGURATION ---
// This tells the server to trust your specific GitHub Pages site
const corsOptions = {
  origin: 'https://yukino-hub.github.io', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // This handles the "Preflight" browser check

// --- 3. MIDDLEWARE ---
app.use(express.json()); 

// --- 4. HEALTH CHECK ROUTE ---
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online and Connected to Aiven Cloud MySQL!');
});

// --- 5. INVENTORY: GET ALL CARDS ---
app.get('/api/inventory', async (req, res) => {
  try {
    const [cards] = await db.execute('SELECT * FROM inventory');
    res.json(cards);
  } catch (error) {
    console.error("Database Error:", error.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// --- 6. AUTH: STAFF REGISTRATION ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await db.execute(
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

// --- 7. AUTH: STAFF LOGIN ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'your_fallback_secret', 
      { expiresIn: '1h' }
    );

    res.json({
      message: 'Login successful!',
      token: token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- 8. INVENTORY: ADD NEW CARD ---
app.post('/api/inventory/add', async (req, res) => {
  const { card_id, card_name, price, stock_quantity } = req.body;
  try {
    const [result] = await db.execute(
      'INSERT INTO inventory (card_id, card_name, price, stock_quantity) VALUES (?, ?, ?, ?)',
      [card_id, card_name, price, stock_quantity]
    );
    res.status(201).json({ message: 'Card added to inventory!', id: result.insertId });
  } catch (error) {
    console.error("Add Card Error:", error.message);
    res.status(500).json({ error: 'Failed to add card to inventory' });
  }
});

// --- 9. START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
