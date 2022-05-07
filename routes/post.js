const express = require('express');
const postRouter = express.Router();

const rateLimit = require('express-rate-limit');

const { requireAuth } = require('../controllers/authController');
const {
  createPost,
  retrievePost,
  votePost,
  deletePost,
  retrievePostFeed,
  retrieveSuggestedPosts,
  retrieveHashtagPosts,
  retrievePostDetails
} = require('../controllers/postController');
const filters = require('../utils/filters');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req, res)=>{
    return res.locals.user._id
  },
  skipFailedRequests:true
});

const voteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  message:{"error":"429 Too many requests, please try again later."},
  keyGenerator:(req, res)=>{
    return res.locals.user._id
  },
  skipFailedRequests:true
});


postRouter.post('/', requireAuth, postLimiter, createPost);
postRouter.post('/:postId/vote', requireAuth,voteLimiter, votePost);

postRouter.get('/suggested/:offset', requireAuth, retrieveSuggestedPosts);
//internal use - start
postRouter.get('/internal/meta/:postId', retrievePostDetails);
//internal use - end

postRouter.get('/filters', (req, res) => {
  res.send({ filters });
});
postRouter.get('/:postId', retrievePost);
postRouter.get('/feed/:offset', requireAuth, retrievePostFeed);
postRouter.get('/hashtag/:hashtag/:offset', requireAuth, retrieveHashtagPosts);

postRouter.delete('/:postId', requireAuth, deletePost);

module.exports = postRouter;
