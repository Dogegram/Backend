const express = require('express');
const paymentRouter = express.Router();

const {
    createSession,
    getWebhook,
} = require('../controllers/paymentController');
const { requireAuth } = require('../controllers/authController');

paymentRouter.get('/createSession/:amount', requireAuth, createSession);
paymentRouter.post('/webhook', getWebhook)
module.exports = paymentRouter;
