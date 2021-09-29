const jwt = require('jwt-simple');
const jwtu = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const axios = require('axios');
const NodeCache = require( "node-cache" );
const myCache = new NodeCache({stdTTL: 10800});
const Sentry = require('@sentry/node');
const { htmlToText } = require('html-to-text');
var scrypt;
const load = async () =>{
  const crypto = require('crypto');
  scrypt = crypto.scrypt;
}
load()


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
      const id = jwt.decode(token, process.env.JWT_SECRET).id;
      var user = await User.findOne(
        { _id: id },
        'email username avatar bookmarks bio rawBio fullName website birthday banned password youtuber'
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
  const { usernameOrEmail, password } = req.body;
  if (authorization) {
    try {
      user = await this.verifyJwt(authorization);

      tokenpass = jwt.decode(authorization, process.env.JWT_SECRET).password;
      
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
         console.log(hashedkey)
        console.log(user.password)
        return res.status(401).send({
          error:
            'The credentials you provided are incorrect, please try again.',
        });
      }

      if (user.banned) {
      let banreason = user.banReason;
        return res.status(401).send({
          error: `User banned, Reason: ${banreason}`,
        });
      }


      res.send({
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar: user.avatar,
        },
        token: jwt.encode({ id: user._id, password: user.password }, process.env.JWT_SECRET),
      });
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

  const emailError = validateEmail(email);
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
      return res.status(400).send('User Email/username already exists.')
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

     // bypass sending protections for development
    // await sendConfirmationEmail(user.username, user.email, confirmationToken);

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
    if (!passwordUpdate.nModified) {
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
