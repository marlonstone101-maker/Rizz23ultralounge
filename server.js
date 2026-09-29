require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); 
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

// Loyverse Direct Order Endpoint
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

// Table Reservation Endpoint
app.post('/api/reserve', async (req, res) => {
  const { name, email, date, time, guests } = req.body;

  if (!name || !email || !date || !time || !guests) {
    return res.status(400).json({ success: false, message: 'Missing required reservation details.' });
  }

  const mailOptions = {
    from: EMAIL_USER,
    to: 'rizz23ultralounge@gmail.com',
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

// Unified route for Menu Orders and Reservations with Bank Transfer Receipt Upload
app.post('/api/submit-order', upload.single('receipt'), async (req, res) => {
    try {
        const { name, email, customerEmail, phone, orderType, orderDetails, totalAmount } = req.body;
        const receiptFile = req.file;

        // Support both req.body.email and req.body.customerEmail
        const clientEmail = email || customerEmail;

        if (!receiptFile) {
            return res.status(400).json({ success: false, message: "Bank transfer receipt is required." });
        }

        // 1. Send Email Notification to Restaurant Email with Receipt Attached
        const adminMailOptions = {
            from: EMAIL_USER,
            to: 'rizz23ultralounge@gmail.com', // Restaurant Email destination
            replyTo: clientEmail || EMAIL_USER,
            subject: `New Paid [${orderType || 'Order/Reservation'}] from ${name}`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2 style="color: #b8860b;">New Order & Verified Bank Transfer</h2>
                    <p><strong>Customer Name:</strong> ${name}</p>
                    <p><strong>Customer Email:</strong> ${clientEmail || 'Not Provided'}</p>
                    <p><strong>Phone Number:</strong> ${phone || 'N/A'}</p>
                    <p><strong>Order Type:</strong> ${orderType || 'Standard Order / Reservation'}</p>
                    <p><strong>Details / Items:</strong> ${orderDetails}</p>
                    <p><strong>Total Amount:</strong> JMD $${totalAmount}</p>
                    <p style="background: #f4f4f4; padding: 10px;"><em>Action Required: Please verify the attached bank transfer receipt image against your bank account before fulfilling.</em></p>
                </div>
            `,
            attachments: [
                {
                    filename: receiptFile.originalname,
                    content: receiptFile.buffer
                }
            ]
        };

        await transporter.sendMail(adminMailOptions);

        // 2. Send Confirmation Email to Customer (if email provided)
        if (clientEmail) {
            const customerMailOptions = {
                from: EMAIL_USER,
                to: clientEmail,
                subject: `Order & Reservation Confirmation - Rizz23 Ultra Lounge`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #b8860b; text-align: center;">Rizz23 Ultra Lounge</h2>
                        <h3 style="border-bottom: 2px solid #b8860b; padding-bottom: 8px;">Order & Reservation Confirmation</h3>
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>Thank you for choosing Rizz23 Ultra Lounge! We have received your submission along with your bank transfer receipt.</p>
                        
                        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <p style="margin: 5px 0;"><strong>Order Type:</strong> ${orderType || 'Standard Order / Reservation'}</p>
                            <p style="margin: 5px 0;"><strong>Details:</strong> ${orderDetails}</p>
                            <p style="margin: 5px 0;"><strong>Total Amount:</strong> JMD $${totalAmount}</p>
                        </div>

                        <p>Our team is currently verifying your payment. Once confirmed, we will process your reservation/order.</p>
                        <p style="margin-top: 20px;">Warm regards,<br><strong>Rizz23 Ultra Lounge Team</strong></p>
                    </div>
                `
            };

            await transporter.sendMail(customerMailOptions);
        }

        // 3. Push Sale Record to Loyverse POS
        try {
            await axios.post('https://api.loyverse.com/v1.0/receipts', {
                store_id: LOYVERSE_STORE_ID,
                total_money: parseFloat(totalAmount) || 0,
                note: `Online Order - ${name} (${phone || 'No phone'})`
            }, {
                headers: {
                    'Authorization': `Bearer ${LOYVERSE_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (loyverseError) {
            console.error("Loyverse POS sync warning:", loyverseError.message);
        }

        res.status(200).json({ success: true, message: "Order and receipt submitted successfully!" });

    } catch (error) {
        console.error("Server submission error:", error);
        res.status(500).json({ success: false, message: "Failed to process order submission." });
    }
});

// Serve Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Server Initialization
app.listen(PORT, () => console.log(`Backend server operational on port ${PORT}`));