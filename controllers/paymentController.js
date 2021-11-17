const stripe = require('stripe')(process.env.STRIPE_SK_KEY_TEST)
const User = require('../models/User');
const ObjectId = require('mongoose').Types.ObjectId;

//extra stuff
const Followers = require('../models/Followers');


module.exports.createSession = async (req, res, next) => {
  const user = res.locals.user;
  var customer = user.stripe_customer_id;
  var currency = 'inr'
  const userid = user._id.toString();

  if(!customer){
    customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userid: userid
      }
    });
  }
  //this does not work when my stripe account is in India
  /*
  if(!userdata.baseAdWalletCurrency){
  if(req.headers['cf-ipcountry'] === 'IN'){
    currency = 'inr'
  }
} else {
  currency = userdata.baseAdWalletCurrency
}
  console.log(customer)
  if(!userdata.baseAdWalletCurrency){
    userdata.baseAdWalletCurrency = currency;
    userdata.save()
  }
  */
  if(req.params.amount % 1 != 0){
    return res.sendStatus(400)
  }
    const session = await stripe.paymentIntents.create({
        amount: req.params.amount*100,
        currency: currency,
        payment_method_types: ['card'],
        metadata:{
          user_id: userid
        },
        customer:customer.id 
      });
      console.log(session)
    res.status(200).send({client_secret: session.client_secret})
}

module.exports.getWebhook = async (req, res, next) => {
  const sig = req.headers['stripe-signature'];
  const body = req.body;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event = null;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.log(err)
    // invalid signature
    res.sendStatus(400);
    return;
  }


  let intent = null;
  switch (event['type']) {
    case 'payment_intent.succeeded':
      intent = event.data.object;

      try{
        var userdata = await User.findOne({ _id: ObjectId(intent.metadata.user_id)}, { adwallet: 1, baseAdWalletCurrency: 1 })
        console.log(userdata)
        var wallet = userdata.adwallet || 0
        wallet += intent.amount/100
        userdata.adwallet = wallet
        userdata.save();
      } catch(err){
        console.error(err)
      }
      console.log("Succeeded:", intent.id);
      break;
    case 'payment_intent.payment_failed':
      intent = event.data.object;
      const message = intent.last_payment_error && intent.last_payment_error.message;
      console.log('Failed:', intent.id, message);
      break;
  }

  res.sendStatus(200);
}

module.exports.createConnectAccount = async (req, res, next) => {
  const user = res.locals.user;
  
  var eligible = await this.getUserPayoutEligibility(user)


  if(eligible === false){
    return res.status(208).send({ error: 'You are not eligible to create a payout account, need more than 1k followers'})
  }
  var userdata = await User.findOne({ _id: ObjectId(user._id)}, { stripe_account_id: 1, creator_payout_enabled: 1})
  if(userdata.creator_payout_enabled){
    return res.status(208).send({ error: 'You already have a payout account for god sake, what are you trying to do??!?!'})
  }
  if(!userdata.stripe_account_id){
    const account = await stripe.accounts.create({
    type: 'standard',
    email: user.email,
  });
  userdata.stripe_account_id = account.id
  userdata.save()
}
  //check with stripe that is the user account already connected
  const accountinfo = await stripe.accounts.retrieve(user.stripe_account_id)
  console.log(accountinfo)
  if(accountinfo.details_submitted){
    userdata.creator_payout_enabled = true;
    userdata.save()
    return res.status(200).send({ status: 'connected'})
  }
const account = { id: userdata.stripe_account_id}
  const accountLinks = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: 'https://localhost:3000/settings/payouts',
    return_url: 'https://localhost:3000/settings/payouts',
    type: 'account_onboarding',
  });
  return res.send({url: accountLinks.url})
}

module.exports.checkAccountStatus = async (req, res, next) => {
  const user = res.locals.user;
  var userdata = await User.findOne({ _id: ObjectId(user._id)}, { stripe_account_id: 1})
  const account = { id: userdata.stripe_account_id}
  const accountStatus = await stripe.accounts.retrieve(account.id)
  console.log(accountStatus)
  return res.send({status: accountStatus.status})
  //a single peice of code i didn't write in this function,
  // all the code is in the stripe api documentation and thanks
  // to the stripe team for making it so easy (and free) (everytime
  // i try to thank github copilot it changes the sentence lol)
}

//not really belongs to payment controller but i'm not sure where to put it
//so i'm putting it here cause its related to the stripe accounts and stuff
module.exports.getUserPayoutEligibility = async (user) => {
  if(user.stripe_account_id){
    return true
  }
  //do checks
  //1) follower count > 1000
  const followersDocument = await Followers.aggregate([{ $match: { user: user._id } }, {$project: { count: { $size:"$followers" }}},]);
  //2) I wanted to check @santaDecides naughty list to check if the user is there or not but i didn't get api :(
  //3) check if the user 13 years old or not - well we don't need to check as all users are above 13
  //4) check number of posts - well we don't need to check as all users have at least 1 post (github copilot thinks so must be true) 
  if(followersDocument[0].count > 10){
    return true
  }
  return false
}