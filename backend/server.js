require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); 

const app = express();

// --- 1. CONFIGURATION ---
const PORT = process.env.PORT || 5000;

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

// --- MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

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
      { expiresIn: '8h' } 
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
    if (error.code === 'ER_DUP_ENTRY') {
       return res.status(400).json({ error: 'That Barcode or Card ID already exists.' });
    }
    console.error("Add Product Error:", error.message);
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update Product
app.put('/api/inventory/:id', async (req, res) => {
  const { id } = req.params;
  const { price, stock_quantity } = req.body;

  try {
    const [result] = await db.execute(
      'UPDATE inventory SET price = ?, stock_quantity = ? WHERE id = ?',
      [price, stock_quantity, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error("Update Product Error:", error.message);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete Product
app.delete('/api/inventory/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.execute('DELETE FROM inventory WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error("Delete Product Error:", error.message);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ==========================================
// CUSTOMER & STORAGE SYSTEM
// ==========================================

// Get All Customers (with basic storage info optional)
app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const [customers] = await db.execute(`
      SELECT id, name, contact_info, is_member, created_at
      FROM customers
      ORDER BY name ASC
    `);
    res.json(customers);
  } catch (error) {
    console.error("Fetch Customers Error:", error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Toggle Membership
app.put('/api/customers/:id/membership', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { is_member } = req.body; // Expect boolean

  try {
    await db.execute('UPDATE customers SET is_member = ? WHERE id = ?', [is_member, id]);
    res.json({ message: 'Membership status updated' });
  } catch (error) {
    console.error("Update Membership Error:", error);
    res.status(500).json({ error: 'Failed to update membership' });
  }
});

// Get Customer Details (Events + Storage)
app.get('/api/customers/:id/details', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get Event History
    const [events] = await db.execute(`
      SELECT e.title, e.game_title, e.event_date, r.registered_at
      FROM event_registrations r
      JOIN events e ON r.event_id = e.id
      WHERE r.customer_id = ?
      ORDER BY e.event_date DESC
    `, [id]);

    // 2. Get Storage Summary
    const [storage] = await db.execute(`
      SELECT game_title, quantity
      FROM customer_storage
      WHERE customer_id = ?
    `, [id]);

    res.json({ events, storage });
  } catch (error) {
    console.error("Fetch Details Error:", error);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// Storage Transaction (Add/Remove)
app.post('/api/storage/transaction', authenticateToken, async (req, res) => {
  const { customer_id, game_title, quantity, action } = req.body;
  // action: 'add' or 'remove'
  // quantity: positive integer
  const staff_id = req.user.id;

  if (!customer_id || !game_title || !quantity || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const change_amount = action === 'add' ? parseInt(quantity) : -parseInt(quantity);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update Storage
    // Check if entry exists
    const [rows] = await connection.execute(
      'SELECT quantity FROM customer_storage WHERE customer_id = ? AND game_title = ?',
      [customer_id, game_title]
    );

    let currentQty = 0;
    if (rows.length > 0) {
      currentQty = rows[0].quantity;
      const newQty = currentQty + change_amount;
      if (newQty < 0) {
        throw new Error('Insufficient storage quantity');
      }
      await connection.execute(
        'UPDATE customer_storage SET quantity = ? WHERE customer_id = ? AND game_title = ?',
        [newQty, customer_id, game_title]
      );
    } else {
      if (change_amount < 0) {
        throw new Error('Insufficient storage quantity (No record found)');
      }
      await connection.execute(
        'INSERT INTO customer_storage (customer_id, game_title, quantity) VALUES (?, ?, ?)',
        [customer_id, game_title, change_amount]
      );
    }

    // 2. Log Transaction
    await connection.execute(
      `INSERT INTO storage_logs (customer_id, staff_id, game_title, change_amount, action_type)
       VALUES (?, ?, ?, ?, ?)`,
      [customer_id, staff_id, game_title, change_amount, action]
    );

    await connection.commit();
    res.json({ message: 'Storage updated successfully' });

  } catch (error) {
    await connection.rollback();
    console.error("Storage Transaction Error:", error.message);
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Get Storage Logs
app.get('/api/storage/logs/:customer_id', authenticateToken, async (req, res) => {
  const { customer_id } = req.params;
  try {
    const [logs] = await db.execute(`
      SELECT l.*, s.username as staff_name
      FROM storage_logs l
      LEFT JOIN staff s ON l.staff_id = s.id
      WHERE l.customer_id = ?
      ORDER BY l.created_at DESC
    `, [customer_id]);
    res.json(logs);
  } catch (error) {
    console.error("Fetch Logs Error:", error);
    res.status(500).json({ error: 'Failed to fetch logs' });
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

// ADMIN: View Registered Players
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

// PUBLIC: Join Event
app.post('/api/events/join', async (req, res) => {
  const { event_id, player_name, contact_info } = req.body;
  
  if (!player_name || !contact_info) {
      return res.status(400).json({ error: "Name and Contact Info are required." });
  }

  const connection = await db.getConnection(); 
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute('SELECT max_players, current_players FROM events WHERE id = ?', [event_id]);
    if (rows.length === 0) throw new Error('Event not found');
    if (rows[0].current_players >= rows[0].max_players) throw new Error('Event is full');

    let customer_id;
    const [existingCustomer] = await connection.execute('SELECT id FROM customers WHERE contact_info = ?', [contact_info]);

    if (existingCustomer.length > 0) {
      customer_id = existingCustomer[0].id;
    } else {
      const [newCust] = await connection.execute('INSERT INTO customers (name, contact_info) VALUES (?, ?)', [player_name, contact_info]);
      customer_id = newCust.insertId;
    }

    await connection.execute('INSERT INTO event_registrations (event_id, customer_id) VALUES (?, ?)', [event_id, customer_id]);
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

// ==========================================
// KEEP-ALIVE (Prevents Aiven from sleeping)
// ==========================================
setInterval(async () => {
  try {
    await db.execute('SELECT 1');
    // console.log('⏰ Keep-alive ping successful'); // Uncomment to see in logs
  } catch (error) {
    console.error('⏰ Keep-alive ping failed:', error.message);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
