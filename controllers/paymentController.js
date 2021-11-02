const stripe = require('stripe')(process.env.STRIPE_SK_KEY_LIVE)
const User = require('../models/User');
const ObjectId = require('mongoose').Types.ObjectId;

module.exports.createSession = async (req, res, next) => {
  const user = res.locals.user;
  const userid = user._id.toString()
  console.log(userid)
  if(!Number.isInteger(req.params.amount)){
    return  res.sendStatus(400)
  }
    const session = await stripe.paymentIntents.create({
        amount: req.params.amount*100,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata:{
          user_id: userid
        }
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
        var userdata = await User.findOne({ _id: ObjectId(intent.metadata.user_id)}, { adwallet: 1 })
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

