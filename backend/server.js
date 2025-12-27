require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();

const PORT = process.env.PORT || 5000;

// --- UPDATED CORS CONFIGURATION ---
const corsOptions = {
  origin: 'https://yukino-hub.github.io', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// FIX: Use Regex /(.*)/ instead of string '*' to prevent PathError
app.options(/(.*)/, cors(corsOptions)); 

app.use(express.json());

// ... (The rest of your code remains exactly the same)
