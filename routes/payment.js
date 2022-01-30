const express = require('express');
const paymentRouter = express.Router();

const {
    createSession,
    getWebhook,
    createConnectAccount,
    createTipsSession
} = require('../controllers/paymentController');
const { requireAuth } = require('../controllers/authController');

paymentRouter.post('/createTipsSession/:username/:amount', requireAuth, createTipsSession);
paymentRouter.get('/createSession/:amount', requireAuth, createSession);
paymentRouter.post('/webhook', getWebhook)
paymentRouter.get('/createConnectAccount', requireAuth, createConnectAccount)
module.exports = paymentRouter;
