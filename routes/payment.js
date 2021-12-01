const express = require('express');
const paymentRouter = express.Router();

const {
    createSession,
    getWebhook,
    createConnectAccount
} = require('../controllers/paymentController');
const { requireAuth } = require('../controllers/authController');

paymentRouter.get('/createSession/:amount', requireAuth, createSession);
paymentRouter.post('/webhook', getWebhook)
paymentRouter.get('/createConnectAccount', requireAuth, createConnectAccount)
module.exports = paymentRouter;
