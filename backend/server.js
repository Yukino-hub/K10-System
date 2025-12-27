require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); 

const app = express();

// --- 1. CONFIGURATION ---
const PORT = process.env.PORT || 5000;

// Advanced CORS (Regex Fixed for Node 22+)
const corsOptions = {
  origin: 'https://yukino-hub.github.io', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions)); 

app.use(express.json()); 

// --- 2. HEALTH CHECK ---
app.get('/', (req, res) => {
  res.send('K10 System Backend is Online and Connected to Aiven Cloud MySQL!');
});

// ==========================================
// AUTH SYSTEM (Staff)
// ==========================================

// Register New Staff
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

// Staff Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await db.execute('SELECT * FROM staff WHERE username = ?', [username]);
    
    if (users.length === 0) return res.status(400).json({ error: 'Invalid username or password' });

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!isMatch) return res.status(400).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '8h' } // Increased to 8 hours for convenience
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

// ==========================================
// INVENTORY SYSTEM
// ==========================================

// Get All Products
app.get('/api/inventory', async (req, res) => {
  try {
    const [products] = await db.execute('SELECT * FROM inventory ORDER BY created_at DESC');
    res.json(products);
  } catch (error) {
    console.error("Database Error:", error.message);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// Add Product (Universal)
app.post('/api/inventory/add', async (req, res) => {
  const { 
    barcode, game_title, product_type, card_id, card_name, set_name, rarity, price, stock_quantity 
  } = req.body;

  try {
    const [result] = await db.execute(
      `INSERT INTO inventory 
      (barcode, game_title, product_type, card_id, card_name, set_name, rarity, price, stock_quantity) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        barcode || null, 
        game_title || 'Hololive', // Reset default to Hololive
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
    if (error.code === 'ER_DUP_ENTRY') {
       return res.status(400).json({ error: 'That Barcode or Card ID already exists.' });
    }
    console.error("Add Product Error:", error.message);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// ==========================================
// EVENT SYSTEM
// ==========================================

// ADMIN: Create Event
app.post('/api/events/create', async (req, res) => {
  const { title, game_title, event_date, entry_fee, max_players, description } = req.body;
  try {
    await db.execute(
      `INSERT INTO events (title, game_title, event_date, entry_fee, max_players, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, game_title, event_date, entry_fee, max_players, description]
    );
    res.status(201).json({ message: 'Event scheduled successfully!' });
  } catch (error) {
    console.error("Create Event Error:", error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUBLIC: Get Upcoming Events
app.get('/api/events', async (req, res) => {
  try {
    const [events] = await db.execute(
      `SELECT * FROM events WHERE event_date >= NOW() ORDER BY event_date ASC`
    );
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ADMIN: View Registered Players (NEW ROUTE)
app.get('/api/events/:id/players', async (req, res) => {
  const eventId = req.params.id;
  try {
    const [players] = await db.execute(
      `SELECT c.name, c.contact_info, r.registered_at 
       FROM event_registrations r
       JOIN customers c ON r.customer_id = c.id
       WHERE r.event_id = ?
       ORDER BY r.registered_at DESC`,
      [eventId]
    );
    res.json(players);
  } catch (error) {
    console.error("Fetch Players Error:", error);
    res.status(500).json({ error: 'Failed to fetch player list' });
  }
});

// PUBLIC: Join Event (Smart Registration)
app.post('/api/events/join', async (req, res) => {
  const { event_id, player_name, contact_info } = req.body;
  
  if (!player_name || !contact_info) {
      return res.status(400).json({ error: "Name and Contact Info are required." });
  }

  const connection = await db.getConnection(); // Transaction Start
  try {
    await connection.beginTransaction();

    // 1. Check Capacity
    const [rows] = await connection.execute('SELECT max_players, current_players FROM events WHERE id = ?', [event_id]);
    if (rows.length === 0) throw new Error('Event not found');
    if (rows[0].current_players >= rows[0].max_players) throw new Error('Event is full');

    // 2. Find or Create Customer
    let customer_id;
    const [existingCustomer] = await connection.execute('SELECT id FROM customers WHERE contact_info = ?', [contact_info]);

    if (existingCustomer.length > 0) {
      customer_id = existingCustomer[0].id;
    } else {
      const [newCust] = await connection.execute('INSERT INTO customers (name, contact_info) VALUES (?, ?)', [player_name, contact_info]);
      customer_id = newCust.insertId;
    }

    // 3. Register Player
    await connection.execute('INSERT INTO event_registrations (event_id, customer_id) VALUES (?, ?)', [event_id, customer_id]);
    
    // 4. Update Event Count
    await connection.execute('UPDATE events SET current_players = current_players + 1 WHERE id = ?', [event_id]);

    await connection.commit();
    res.json({ message: 'Registration successful! See you there.' });

  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'You have already registered for this event!' });
    }
    console.error("Join Error:", error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  } finally {
    connection.release();
  }
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
