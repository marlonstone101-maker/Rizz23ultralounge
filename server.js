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
app.use(express.urlencoded({ extended: true }));
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
  WIPAY_FEE_STRUCTURE = 'customer', // 'customer' or 'merchant'
  WIPAY_ENVIRONMENT = 'live', // 'sandbox' or 'live'
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

// WiPay API Endpoints based on environment
const WIPAY_URL = WIPAY_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox.wipayfinancial.com/v1/voucher'
  : 'https://tt.wipayfinancial.com/v1/voucher';

// ==========================================
// 1. WIPAY CARD CHECKOUT INITIATION
// ==========================================
app.post('/api/wipay-checkout', async (req, res) => {
  try {
    const { name, email, phone, orderType, orderDetails, totalAmount } = req.body;

    if (!totalAmount || isNaN(parseFloat(totalAmount))) {
      return res.status(400).json({ success: false, message: 'Invalid total amount.' });
    }

    const orderId = `RIZZ-${Date.now()}`;
    const returnUrl = `https://${req.get('host')}/api/wipay-callback?orderId=${orderId}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email || '')}&phone=${encodeURIComponent(phone || '')}&type=${encodeURIComponent(orderType || 'Order')}&details=${encodeURIComponent(orderDetails || '')}&amount=${totalAmount}`;

    const payload = new URLSearchParams({
      account_number: WIPAY_ACCOUNT_NUMBER,
      currency: 'JMD',
      environment: WIPAY_ENVIRONMENT,
      fee: WIPAY_FEE_STRUCTURE,
      method: 'credit_card',
      order_id: orderId,
      total: parseFloat(totalAmount).toFixed(2),
      return_url: returnUrl,
      response_url: returnUrl
    });

    // Generate WiPay hosted card checkout URL
    const checkoutUrl = `https://tt.wipayfinancial.com/v1/gateway_pay?${payload.toString()}`;

    return res.status(200).json({
      success: true,
      url: checkoutUrl,
      orderId: orderId
    });

  } catch (error) {
    console.error('WiPay Checkout Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to initialize WiPay payment.' });
  }
});

// ==========================================
// 2. WIPAY RETURN / CALLBACK HANDLER
// ==========================================
app.all('/api/wipay-callback', async (req, res) => {
  try {
    const data = { ...req.query, ...req.body };
    const { status, orderId, name, email, phone, type, details, amount, transaction_id } = data;

    // Check payment status from WiPay redirect/webhook
    const isSuccess = status === 'success' || status === '1' || data.status_code === '100';

    if (isSuccess) {
      // A. Send Admin Email Notification to Restaurant
      const adminMailOptions = {
        from: EMAIL_USER,
        to: 'rizz23ultralounge@gmail.com',
        replyTo: email || EMAIL_USER,
        subject: `[PAID CARD] New ${type || 'Order'} - ${name}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #b8860b;">Paid ${type || 'Order'} Notification (WiPay Card)</h2>
            <p><strong>Customer Name:</strong> ${name}</p>
            <p><strong>Customer Email:</strong> ${email || 'N/A'}</p>
            <p><strong>Phone Number:</strong> ${phone || 'N/A'}</p>
            <p><strong>Order Type:</strong> ${type || 'Standard Order / Reservation'}</p>
            <p><strong>Details / Items:</strong> ${details}</p>
            <p><strong>Total Amount Paid:</strong> JMD $${amount}</p>
            <p><strong>WiPay Transaction ID:</strong> ${transaction_id || orderId}</p>
          </div>
        `
      };
      await transporter.sendMail(adminMailOptions);

      // B. Send Customer Receipt Email
      if (email) {
        const customerMailOptions = {
          from: EMAIL_USER,
          to: email,
          subject: `Order & Reservation Confirmation - Rizz23 Ultra Lounge`,
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
              <h2 style="color: #b8860b; text-align: center;">Rizz23 Ultra Lounge</h2>
              <h3 style="border-bottom: 2px solid #b8860b; padding-bottom: 8px;">Card Payment Receipt Confirmation</h3>
              <p>Hi <strong>${name}</strong>,</p>
              <p>Thank you for your payment! Your reservation/order has been successfully placed and paid using debit/credit card via WiPay.</p>
              
              <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Type:</strong> ${type || 'Order / Reservation'}</p>
                <p style="margin: 5px 0;"><strong>Details:</strong> ${details}</p>
                <p style="margin: 5px 0;"><strong>Total Paid:</strong> JMD $${amount}</p>
                <p style="margin: 5px 0;"><strong>Transaction Reference:</strong> ${transaction_id || orderId}</p>
              </div>

              <p>We look forward to hosting you at Rizz23 Ultra Lounge!</p>
              <p style="margin-top: 20px;">Warm regards,<br><strong>Rizz23 Ultra Lounge Team</strong></p>
            </div>
          `
        };
        await transporter.sendMail(customerMailOptions);
      }

      // C. Push Sale Record to Loyverse POS
      try {
        await axios.post('https://api.loyverse.com/v1.0/receipts', {
          store_id: LOYVERSE_STORE_ID,
          pos_device_id: LOYVERSE_POS_ID,
          receipt_type: 'SALE',
          note: `CARD PAID (${type || 'Order'}) - ${name} (${phone || 'No phone'}) - Ref: ${transaction_id || orderId}`,
          line_items: [
            {
              item_name: `${type || 'Online Order'}: ${details ? details.substring(0, 30) : 'General'}`,
              quantity: 1,
              price: parseFloat(amount) || 0
            }
          ],
          payments: [
            {
              payment_type_id: LOYVERSE_PAYMENT_TYPE_ID,
              paid_amount: parseFloat(amount) || 0
            }
          ]
        }, {
          headers: {
            'Authorization': `Bearer ${LOYVERSE_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (loyverseError) {
        console.error('Loyverse POS sync error:', loyverseError.response?.data || loyverseError.message);
      }

      return res.redirect('/?payment=success');
    } else {
      return res.redirect('/?payment=failed');
    }

  } catch (error) {
    console.error('WiPay Callback Processing Error:', error);
    return res.redirect('/?payment=error');
  }
});

// ==========================================
// 3. TABLE RESERVATIONS (DIRECT EMAIL & LOYVERSE)
// ==========================================
app.post('/api/reserve', async (req, res) => {
  const { name, email, phone, date, time, guests, notes } = req.body;

  if (!name || !email || !date || !time || !guests) {
    return res.status(400).json({ success: false, message: 'Missing required reservation details.' });
  }

  const mailOptions = {
    from: EMAIL_USER,
    to: 'rizz23ultralounge@gmail.com',
    replyTo: email,
    subject: `New Table Reservation Request - ${name}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h3 style="color: #b8860b;">New Table Reservation Request</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Guests:</strong> ${guests}</p>
        <p><strong>Notes:</strong> ${notes || 'None'}</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, message: 'Reservation sent successfully!' });
  } catch (error) {
    console.error('Reservation email error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send reservation request.' });
  }
});

// ==========================================
// 4. LOYVERSE DIRECT ORDER DISPATCH
// ==========================================
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

// Serve Frontend Static Index Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server
app.listen(PORT, () => console.log(`Rizz23 Ultra Lounge Server active on port ${PORT}`));