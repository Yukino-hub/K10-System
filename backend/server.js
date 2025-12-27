require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); // Ensure your db.js has the SSL settings we discussed

const app = express();

// --- 1. DYNAMIC PORT FOR RENDER ---
const PORT = process.env.PORT || 5000;

// --- 2. ADVANCED CORS CONFIGURATION (Regex Fixed) ---
const corsOptions = {
  origin: 'https://yukino-hub.github.io', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
// Use Regex pattern to prevent "PathError" crash on newer Node versions
app.options(/(.*)/, cors(corsOptions)); 

// --- 3. MIDDLEWARE ---
app.use(express.json()); 

// --- 4. HEALTH CHECK ROUTE ---
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online and Connected to Aiven Cloud MySQL!');
});

// --- 5. INVENTORY: GET ALL PRODUCTS ---
app.get('/api/inventory', async (req, res) => {
  try {
    const [products] = await db.execute('SELECT * FROM inventory ORDER BY created_at DESC');
    res.json(products);
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

// --- 8. INVENTORY: ADD UNIVERSAL PRODUCT ---
app.post('/api/inventory/add', async (req, res) => {
  const { 
    barcode,        // Optional: For sealed boxes
    game_title,     // 'Hololive', 'One Piece', etc.
    product_type,   // 'Single', 'Booster Box', etc.
    card_id,        // Optional: For singles
    card_name, 
    set_name,       // Optional: 'Blooming Radiance'
    rarity,         // Optional: 'RRR'
    price, 
    stock_quantity 
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO inventory 
      (barcode, game_title, product_type, card_id, card_name, set_name, rarity, price, stock_quantity) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barcode || null, 
        game_title || 'Hololive', 
        product_type || 'Single', 
        card_id || null, 
        card_name, 
        set_name || null, 
        rarity || null, 
        price, 
        stock_quantity
      ]
    );

    res.status(201).json({ message: 'Product added successfully!', id: result.insertId });
  } catch (error) {
    // Handle Duplicate Barcodes or IDs
    if (error.code === 'ER_DUP_ENTRY') {
       return res.status(400).json({ error: 'That Barcode or Card ID already exists.' });
    }
    console.error("Add Product Error:", error.message);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// --- 9. START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
