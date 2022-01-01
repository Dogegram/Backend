const stripe = require('stripe')(process.env.STRIPE_SK_KEY_LIVE)
const User = require('../models/User');
const ObjectId = require('mongoose').Types.ObjectId;

//extra stuff
const Followers = require('../models/Followers');


module.exports.getCreatorPayoutDetails = async (req, res, next) => {
  const user = res.locals.user;
  var accountID = user.stripe_account_id;
  var currency = 'inr'
  const userid = user._id.toString();

  if(!user.creator_payout_enabled){
    return res.status(200).json({ error: 'Payouts are not enabled for this account' });
  }
  //get the stripe account balance from stripe account id 
    const balance = await stripe.balance.retrieve({
      stripeAccount: accountID,
    });
    const balanceAmount = balance.available[0].amount/100;
    const balancePendingAmount = balance.pending[0].amount/100;
    console.log(balance);
    //get the stripe account transactions from stripe account id
    // listTransactions is not A FUNCTION DAMM IT GITHUB COPILOT
  //  const balanceTransactions = await stripe.balanceTransactions.list({
   //   limit: 3,
   // }, {
   //   stripeAccount: accountID,
   // });
   // transactions are just very difficult to get and so we are not going to do that at least for now :(
   // console.log(balanceTransactions);
    res.status(200).json({ balance: balanceAmount, pending: balancePendingAmount});

}

module.exports.changePaymentStatus = async (req, res, next) => {
  const user = res.locals.user;
  const enabled = req.body.enabled;
  var userDoc = await User.findById(user._id);
  if(enabled){
    userDoc.payments_enabled = true;
  }
  else{
    userDoc.payments_enabled = false;
  }
  await userDoc.save();
  res.status(200).json({ message: 'Payments enabled set' });
}
