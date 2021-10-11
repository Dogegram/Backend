const express = require('express');
const commentRouter = express.Router();
const rateLimit = require('express-rate-limit');

const voteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});


const commentLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});

const commentminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});

const { requireAuth } = require('../controllers/authController');
const {
  createComment,
  deleteComment,
  voteComment,
  createCommentReply,
  deleteCommentReply,
  voteCommentReply,
  retrieveCommentReplies,
  retrieveComments,
} = require('../controllers/commentController');

commentRouter.post('/:postId', commentLimiter, commentminLimiter, requireAuth, createComment);
commentRouter.post('/:commentId/vote', voteLimiter, requireAuth, voteComment);
commentRouter.post('/:commentReplyId/replyVote', voteLimiter, requireAuth, voteCommentReply);
commentRouter.post('/:parentCommentId/reply', commentLimiter, requireAuth, createCommentReply);

commentRouter.get('/:parentCommentId/:offset/replies/', retrieveCommentReplies);
commentRouter.get('/:postId/:offset/:exclude', retrieveComments);

commentRouter.delete('/:commentId', requireAuth, deleteComment);
commentRouter.delete('/:commentReplyId/reply', requireAuth, deleteCommentReply);

module.exports = commentRouter;
