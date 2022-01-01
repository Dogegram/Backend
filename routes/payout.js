const express = require('express');
const payoutRouter = express.Router();

const { 
    getCreatorPayoutDetails,
    changePaymentStatus
 } = require('../controllers/payoutController');

const { requireAuth } = require('../controllers/authController');

//dashboard data is classified as 'FinData'
payoutRouter.get('/fetchUserData/finData', requireAuth, getCreatorPayoutDetails);
payoutRouter.post('/changePaymentStatus', requireAuth, changePaymentStatus);

module.exports = payoutRouter;