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
const {
  LOYVERSE_TOKEN,
  LOYVERSE_STORE_ID,
  LOYVERSE_POS_ID,
  LOYVERSE_PAYMENT_TYPE_ID,
  EMAIL_USER,
  EMAIL_PASS,
  WIPAY_ACCOUNT_NUMBER,
  WIPAY_API_KEY,
  WIPAY_ENVIRONMENT = 'sandbox',
  PORT = 3000
} = process.env;

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS
  }
});

// Loyverse Order Endpoint
app.post('/api/create-order', async (req, res) => {
  const { customerName, customerEmail, deliveryNotes, itemName, amount } = req.body;

  if (!itemName || !amount) {
    return res.status(400).json({ success: false, error: 'Missing required order details.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({ success: false, error: 'Invalid amount provided.' });
  }

  const loyverseOrderPayload = {
    store_id: LOYVERSE_STORE_ID,
    pos_device_id: LOYVERSE_POS_ID,
    receipt_type: 'SALE',
    note: `ONLINE ORDER | Customer: ${customerName || 'N/A'} | Contact: ${customerEmail || 'N/A'} | Notes: ${deliveryNotes || 'None'}`,
    line_items: [
      {
        item_name: itemName,
        quantity: 1,
        price: parsedAmount
      }
    ],
    payments: [
      {
        payment_type_id: LOYVERSE_PAYMENT_TYPE_ID,
        paid_amount: parsedAmount
      }
    ]
  };

  try {
    const response = await axios.post('https://api.loyverse.com/v1.0/receipts', loyverseOrderPayload, {
      headers: {
        Authorization: `Bearer ${LOYVERSE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return res.status(200).json({ success: true, receipt: response.data });
  } catch (error) {
    console.error('Loyverse Order Error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to dispatch order to Loyverse KDS.',
      details: error.response?.data || error.message
    });
  }
});

// Reservation Email Endpoint
app.post('/api/reserve', async (req, res) => {
  const { name, email, date, time, guests } = req.body;

  if (!name || !email || !date || !time || !guests) {
    return res.status(400).json({ success: false, message: 'Missing required reservation details.' });
  }

  const mailOptions = {
    from: EMAIL_USER,
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
    return res.status(200).json({ success: true, message: 'Reservation sent successfully!' });
  } catch (error) {
    console.error('Mail error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send reservation.' });
  }
});

// WiPay Payment Endpoint
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, order_id, customer_email, phone } = req.body;

    if (!amount || !order_id) {
      return res.status(400).json({ success: false, message: 'Missing required amount or order_id.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ success: false, message: 'Invalid amount format.' });
    }

    const wipayPayload = {
      account_no: WIPAY_ACCOUNT_NUMBER,
      api_key: WIPAY_API_KEY,
      environment: WIPAY_ENVIRONMENT,
      amount: parsedAmount.toFixed(2),
      order_id,
      response_url: 'https://rizz23ultralounge.com/payment-complete',
      method: 'credit_card'
    };

    console.log(`Processing WiPay payment for Order ${order_id} in ${WIPAY_ENVIRONMENT} mode.`);

    return res.status(200).json({
      success: true,
      message: 'WiPay payment transaction initialized successfully.',
      environment: WIPAY_ENVIRONMENT,
      order_id,
      amount: parsedAmount.toFixed(2)
    });
  } catch (error) {
    console.error('WiPay Payment Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Server Initialization
app.listen(PORT, () => console.log(`Backend server operational on port ${PORT}`));