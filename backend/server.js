// ==========================================
// EVENT SYSTEM ROUTES
// ==========================================

// 1. ADMIN: Create a new Event
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

// 2. PUBLIC: Get Upcoming Events
app.get('/api/events', async (req, res) => {
  try {
    // Show events sorted by date
    const [events] = await db.execute(
      `SELECT * FROM events WHERE event_date >= NOW() ORDER BY event_date ASC`
    );
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// 3. PUBLIC: Join Event (The "Smart" Logic)
app.post('/api/events/join', async (req, res) => {
  const { event_id, player_name, contact_info } = req.body;
  
  if (!player_name || !contact_info) {
      return res.status(400).json({ error: "Name and Contact Info are required." });
  }

  const connection = await db.getConnection(); // Get a dedicated connection
  try {
    await connection.beginTransaction(); // Start "Safe Mode"

    // A. Check Capacity
    const [rows] = await connection.execute('SELECT max_players, current_players FROM events WHERE id = ?', [event_id]);
    if (rows.length === 0) throw new Error('Event not found');
    if (rows[0].current_players >= rows[0].max_players) throw new Error('Event is full');

    // B. Find or Create Customer
    let customer_id;
    const [existingCustomer] = await connection.execute('SELECT id FROM customers WHERE contact_info = ?', [contact_info]);

    if (existingCustomer.length > 0) {
      customer_id = existingCustomer[0].id; // Found them!
    } else {
      const [newCust] = await connection.execute('INSERT INTO customers (name, contact_info) VALUES (?, ?)', [player_name, contact_info]);
      customer_id = newCust.insertId; // Created new!
    }

    // C. Register (Check duplicates happens automatically via Database UNIQUE constraint)
    await connection.execute('INSERT INTO event_registrations (event_id, customer_id) VALUES (?, ?)', [event_id, customer_id]);
    
    // D. Update Count
    await connection.execute('UPDATE events SET current_players = current_players + 1 WHERE id = ?', [event_id]);

    await connection.commit(); // Save changes
    res.json({ message: 'Registration successful! See you there.' });

  } catch (error) {
    await connection.rollback(); // Undo if anything failed
    // Check for duplicate registration error
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'You have already registered for this event!' });
    }
    console.error("Join Error:", error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  } finally {
    connection.release();
  }
});
