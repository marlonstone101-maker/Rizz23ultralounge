require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Environment Variables
const LOYVERSE_TOKEN = process.env.LOYVERSE_TOKEN;
const LOYVERSE_STORE_ID = process.env.LOYVERSE_STORE_ID;
const LOYVERSE_POS_ID = process.env.LOYVERSE_POS_ID;
const LOYVERSE_PAYMENT_TYPE_ID = process.env.LOYVERSE_PAYMENT_TYPE_ID;

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Loyverse Order Endpoint
app.post('/api/create-order', async (req, res) => {
  const { customerName, customerEmail, deliveryNotes, itemName, amount } = req.body;
  
  if (!itemName || !amount) {
    return res.status(400).json({ success: false, error: 'Missing required order details.' });
  }

  const loyverseOrderPayload = {
    store_id: LOYVERSE_STORE_ID,
    pos_device_id: LOYVERSE_POS_ID,
    receipt_type: "SALE",
    note: `ONLINE ORDER | Customer: ${customerName || 'N/A'} | Contact: ${customerEmail || 'N/A'} | Notes: ${deliveryNotes || 'None'}`,
    line_items: [
      {
        item_name: itemName,
        quantity: 1,
        price: parseFloat(amount)
      }
    ],
    payments: [
      {
        payment_type_id: LOYVERSE_PAYMENT_TYPE_ID,
        paid_amount: parseFloat(amount)
      }
    ]
  };

  try {
    const response = await axios.post('https://api.loyverse.com/v1.0/receipts', loyverseOrderPayload, {
      headers: {
        'Authorization': `Bearer ${LOYVERSE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ success: true, receipt: response.data });
  } catch (error) {
    console.error('Loyverse Order Error:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to dispatch order to Loyverse KDS.',
      details: error.response ? error.response.data : error.message
    });
  }
});

// Reservation Email Endpoint
app.post('/api/reserve', async (req, res) => {
  const { name, email, date, time, guests } = req.body;
console.log('Incoming Reservation:', req.body);
  if (!name || !email || !date || !time || !guests) {
    return res.status(400).send({ success: false, message: 'Missing required reservation details.' });
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: 'reservations@rizz23ultralounge.com',
    replyTo: email,
    subject: `New Table Reservation Request - ${name}`,
    text: `Name: ${name}\nEmail: ${email}\nDate: ${date}\nTime: ${time}\nGuests: ${guests}`,
    html: `
      <h3>New Reservation Request</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Date:</strong> ${date}</p>
      <p><strong>Time:</strong> ${time}</p>
      <p><strong>Guests:</strong> ${guests}</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send({ success: true, message: 'Reservation sent successfully!' });
  } catch (error) {
    console.error('Mail error:', error);
    res.status(500).send({ success: false, message: 'Failed to send reservation.' });
  }
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Server Initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend server operational on port ${PORT}`));