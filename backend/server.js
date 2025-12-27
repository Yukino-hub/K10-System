require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// --- CORS CONFIGURATION (Updated with Regex Fix) ---
const corsOptions = {
  origin: 'https://yukino-hub.github.io', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// This line uses a Regex pattern to avoid the crash you saw earlier
app.options(/(.*)/, cors(corsOptions)); 

app.use(express.json());

// --- HEALTH CHECK ---
app.get('/', (req, res) => {
  res.send('K10 Backend is Live!');
});

// --- INVENTORY ROUTE ---
app.get('/api/inventory', async (req, res) => {
  try {
    const [cards] = await db.execute('SELECT * FROM inventory');
    res.json(cards);
  } catch (error) {
    console.error("Database Error:", error.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// --- REGISTER ROUTE ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    await db.execute('INSERT INTO staff (username, password_hash) VALUES (?, ?)', [username, hashedPassword]);
    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LOGIN ROUTE ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
    if (users.length === 0) return res.status(400).json({ error: 'Invalid User' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid Password' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1h' });
    
    res.json({ token, user: { username: user.username } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- ADD CARD ROUTE ---
app.post('/api/inventory/add', async (req, res) => {
  const { card_id, card_name, price, stock_quantity } = req.body;
  try {
    await db.execute('INSERT INTO inventory (card_id, card_name, price, stock_quantity) VALUES (?, ?, ?, ?)', 
      [card_id, card_name, price, stock_quantity]);
    res.status(201).json({ message: 'Card added' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- START SERVER (Crucial Step) ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
