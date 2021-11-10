const express = require('express');
const authRouter = express.Router();
const rateLimit = require('express-rate-limit');

const {
  loginAuthentication,
  register,
  requireAuth,
  changePassword,
  forgetPassword,
  forgetpassreset
} = require('../controllers/authController');

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});

const passLimiter = rateLimit({
  windowMs: 3 * 60 * 60 * 1000,
  max: 5,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});


const signupLimiter = rateLimit({
  windowMs: 3 * 60 * 60 * 1000,
  max: 5,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});


authRouter.post('/login', loginLimiter, loginAuthentication);
authRouter.post('/register', signupLimiter, register);
authRouter.post('/forgetpassword', passLimiter, forgetPassword);
authRouter.post('/passChangeReset', passLimiter, forgetpassreset);


authRouter.put('/password', passLimiter, requireAuth, changePassword);

module.exports = authRouter;
