const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const LOYVERSE_TOKEN = process.env.LOYVERSE_TOKEN || 'test_token_123';
const LOYVERSE_STORE_ID = process.env.LOYVERSE_STORE_ID || 'test_token_123';
const LOYVERSE_POS_ID = process.env.LOYVERSE_POS_ID || 'test_token_123';

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
        payment_type_id: "CASH", 
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
    res.status(500).json({ success: false, error: 'Failed to dispatch order to Loyverse KDS.' });
  }
});
app.get('/', (req, res) => {res.send('Server is up and running!');});
app.listen(3000, () => console.log('Backend server operational on port 3000'));