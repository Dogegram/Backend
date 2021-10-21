const express = require('express');
const authRouter = require('./auth');
const userRouter = require('./user');
const postRouter = require('./post');
const commentRouter = require('./comment');
const notificationRouter = require('./notification');
const apiRouter = express.Router();
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs:  60000,
    max: 100,
    message:{"error":"429 too many requests"},
    keyGenerator:(req)=>{
      req.header("cf-connecting-ip")
    }
  });
apiRouter.use(limiter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/post', postRouter);
apiRouter.use('/comment', commentRouter);
apiRouter.use('/notification', notificationRouter);

module.exports = apiRouter;