const jwt = require('jwt-simple');
const jwtu = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const axios = require('axios');
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({stdTTL: 10800});
const Sentry = require('@sentry/node');
const { htmlToText } = require('html-to-text');
var scrypt;
const twofactor = require("node-2fa");
scrypt = crypto.scrypt;




const {
  sendConfirmationEmail,
  generateUniqueUsername,
  sendPasswordResetEmail
} = require('../utils/controllerUtils');
const {
  validateEmail,
  validateFullName,
  validateUsername,
  validatePassword,
  validateBirthday,
  validatePronoun
} = require('../utils/validation');

module.exports.verifyJwt = (token) => {
  return new Promise(async (resolve, reject) => {
    try {
      const id = jwtu.verify(token, process.env.JWT_SECRET).id;
      var user = await User.findOne(
        { _id: id },
        'email username avatar bookmarks bio rawBio fullName website birthday banned password youtuber twofactor adwallet baseAdWalletCurrency whisperEmail stripe_customer_id creator_payout_enabled'
      );

      if(user.username === 'hrichik'){
        user.admin = true;
      } 

      if(user.banned){
        reject('Not authorized.');
      }
      if (user) {
        return resolve(user);
      } else {
        reject('Not authorized.');
      }
    } catch (err) {
      console.log(err)
      return reject('Not authorized.');
    }
  });
};

module.exports.requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization) return res.status(401).send({ error: 'Not authorized' });
  try {
    const user = await this.verifyJwt(authorization);
    // Allow other middlewares to access the authenticated user details.

    res.locals.user = user;
    Sentry.setUser({ email: user.email });
    return next();
  } catch (err) {
    return res.status(401).send({ error: err });
  }
};

module.exports.optionalAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (authorization) {
    try {
      const user = await this.verifyJwt(authorization);
      // Allow other middlewares to access the authenticated user details.
      res.locals.user = user;
    } catch (err) {
      return res.status(401).send({ error: err });
    }
  }
  return next();
};

module.exports.loginAuthentication = async (req, res, next) => {
  const { authorization } = req.headers;
  const { usernameOrEmail, password, twofactorCode } = req.body;
  if (authorization) {
    try {
      user = await this.verifyJwt(authorization);

      tokenpass = jwtu.verify(authorization, process.env.JWT_SECRET).password;
      
        if (tokenpass != user.password) {
          return res.status(401).send({
            error:
              'The credentials you provided are incorrect, please try again.',
          })
        }
      
      return res.send({
        user,
        token: authorization,
      });
    } catch (err) {
      return res.status(401).send({ error: err });
    }
  }

  if (!usernameOrEmail || !password) {
    return res
      .status(400)
      .send({ error: 'Please provide both a username/email and a password.' });
  }

  

  try {
    const user = await User.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });
    if (!user || !user.password) {
      return res.status(401).send({
        error: 'The credentials you provided are incorrect, please try again.',
      });
    }

    scrypt(password, process.env.PASS_SALT, 64, (err, derivedKey) => {
      if (err) throw err;
  var hashedkey = derivedKey.toString('hex');

      if (hashedkey != user.password) {
        return res.status(401).send({
          error:
            'The credentials you provided are incorrect, please try again.',
        });
      }
      if(user.twofactor && !twofactorCode){
        return res.status(401).send({
          error: '2FA',
        });
      }

      if(user.twofactor){

      console.log(user.recovery2fa.includes(twofactorCode))

      if(!user.recovery2fa.includes(twofactorCode)){
        console.log(user.recovery2fa.includes(twofactorCode))

      var isright = twofactor.verifyToken(user.secret2fa, twofactorCode);
      console.log(isright)
  
      if(isright === null){
        return res.status(401).send({done:false, error:'the code given is incorrect. please try again'})
      } else if(isright.delta != 0){
        return res.status(400).send({done:false, error:'the code given is late/early. please try again'})
      }
    } else {
      var revcode = user.recovery2fa.indexOf(twofactorCode)
      var rfrevcode = user.recovery2fa.splice(revcode,1)[0]
      if(rfrevcode === twofactorCode){
        user.save()
      }
    }
}
      if (user.banned) {
      let banreason = user.banReason;
        return res.status(401).send({
          error: `User banned, Reason: ${banreason}`,
        });
      }

      const jwtAuthToken = jwtu.sign({ id: user._id, password: user.password }, process.env.JWT_SECRET, { expiresIn: '3d' });
      const userLoginObject = {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar: user.avatar,
        },
        token: jwtAuthToken,
      }
      console.log(userLoginObject)

      res.send(userLoginObject);
    });
  } catch (err) {
    next(err);
  }
};

module.exports.register = async (req, res, next) => {
  const { username, birthday, pronoun, fullName, email, password } = req.body;
  let user = null;
  let confirmationToken = null;

  
  const birthdayError = validateBirthday(birthday);
  if (birthdayError) return res.status(400).send({ error: birthdayError });

 // NOW OPEN BETA, YAY!!! fix this !process.env.SIGNUP_OPEN ||
 if(!process.env.SIGNUP_OPEN ){
  return res.status(400).send({ error: "Sorry, Signups are closed" });
}
  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).send({ error: usernameError });

  const fullNameError = validateFullName(fullName);
  if (fullNameError) return res.status(400).send({ error: fullNameError });

  const pronounError = validatePronoun(pronoun);
  if (pronounError) return res.status(400).send({ error: pronounError });

  const emailError = await validateEmail(email);
  if (emailError) return res.status(400).send({ error: emailError });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).send({ error: passwordError });

  const emailSendError = myCache.get(email)
  if (emailSendError) return res.status(400).send({ error: "Error sending verification mail, please try again later." });

  try {

    userpasswordenc = null;

    scrypt(password, process.env.PASS_SALT, 64, async (err, derivedKey) => {
     userpasswordenc = derivedKey.toString('hex');
    
    
     user = {
      username: username,
      fullName: fullName,
      email: email,
      pronoun:pronoun,
      birthday: birthday,
      password: userpasswordenc
     }

     trygetuseremailsame = await User.findOne({
      email:email
    })
    
    trygetusernamesame = await User.findOne({
      username:username
    })

    if(trygetusernamesame || trygetuseremailsame){
      return res.status(400).send({error: 'User Email/username already exists.'})
    }

     confirmationToken = jwtu.sign(user, process.env.JWT_SECRET, { expiresIn: '3h' });
    console.log(confirmationToken)

     // bypass sending protections for development
    // await sendConfirmationEmail(user.username, user.email, confirmationToken);

     asent = myCache.get(email);


       if(!asent){
     await sendConfirmationEmail(user.username, user.email, confirmationToken);
    obj = { email: email };
 
    success = myCache.set(email , obj);
    if(!success){
      myCache.set(email , obj);
    }
       } else {
     return res.status(400).send({
        success: false, 
        error: "Error sending verification mail, please try again later."
      });
    }
      

    return res.status(200).send({
      success: true, 
      message: "Check your inbox for the welcome mail we just sent! (Don't forget to check your spam folder, ai misbehaves sometimes)"
    });
 })
  } catch (err) {
    next(err);
  }
};

module.exports.changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const user = res.locals.user;
  let currentPassword = undefined;

  try {
    const userDocument = await User.findById(user._id);
    currentPassword = userDocument.password;

    const result = await bcrypt.compare(oldPassword, currentPassword);
    if (!result) {
      return res.status('401').send({
        error: 'Your old password was entered incorrectly, please try again.',
      });
    }

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError)
      return res.status(400).send({ error: newPasswordError });

    userDocument.password = newPassword;
    await userDocument.save();
    return res.send();
  } catch (err) {
    return next(err);
  }
};

module.exports.forgetPassword = async (req, res, next) => {
  console.log(req.body)
  const { email } = req.body;
  let user = null;
  let confirmationToken = null;

  const emailError = validateEmail(email);
  if (emailError) return res.status(400).send({ error: emailError });

  const emailSendError = false //|| myCache.get(email)
  if (emailSendError) return res.status(400).send({ error: "Error sending verification mail, please try again later." });

  try {
     user = {
      email: email
     }

     confirmationToken = jwtu.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
     resetURL = `https://page.util.dogegram.xyz/email/passwordReset?token=${confirmationToken}`


     asent = myCache.get(email);


       if(!asent){
     await sendPasswordResetEmail( user.email, resetURL);
    obj = { email: email };
 
    success = myCache.set(email , obj);
    if(!success){
      myCache.set(email , obj);
    }
       } else {
     return res.status(400).send({
        success: false, 
        error: "Error sending password reset mail, please try again later."
      });
    }
      

    return res.status(400).send({
      success: true, 
      error: "Password Reset email sent (Valid for 1hrs), please check your email inbox. If you didn't find the mail in the inbox, please check your email's spam folder."
    });
  } catch (err) {
    next(err);
  }
};

module.exports.forgetpassreset = async (req, res, next)=>{
  const { usertoken, password } = req.body;
  const newPasswordError = validatePassword(password);
  if (newPasswordError)
    return res.status(400).send({ error: newPasswordError });
     try {
    const user = jwtu.decode(usertoken, process.env.JWT_SECRET, { expiresIn: '1h' });
    const saltRounds = 10;
      bcrypt.genSalt(saltRounds, async (err, salt) => {
        if (err) return next(err);
        bcrypt.hash(password, salt, async (err, hash) => {
          if (err) return next(err);
          this.password = hash;


    const passwordUpdate = await User.updateOne(
      { email: user.email },
      { password: hash }
    );
    if (!passwordUpdate.acknowledged) {
      throw new Error('Could not update your password.');
    } else {
      return res.send("Password Updated!")
    }
        });
      });
    
  } catch(err) {
    throw new Error(err);
  }
}
