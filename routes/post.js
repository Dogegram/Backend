const express = require('express');
const postRouter = express.Router();
const multer = require('multer');
const upload = multer({
  dest: 'temp/',
  limits: { fileSize: 2 * 1024 * 1024 },
  message:"File too large, you can post images only up to 2MB"
}).single('image');

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
} = require('../controllers/postController');
const filters = require('../utils/filters');

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message:{"error":"429 Too many requests, please try again later."}
});

const voteLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 200,
  message:{"error":"429 Too many requests, please try again later."}
});


postRouter.post('/', postLimiter, requireAuth, upload, createPost);
postRouter.post('/:postId/vote',voteLimiter, requireAuth, votePost);

postRouter.get('/suggested/:offset', requireAuth, retrieveSuggestedPosts);
postRouter.get('/filters', (req, res) => {
  res.send({ filters });
});
postRouter.get('/:postId', retrievePost);
postRouter.get('/feed/:offset', requireAuth, retrievePostFeed);
postRouter.get('/hashtag/:hashtag/:offset', requireAuth, retrieveHashtagPosts);

postRouter.delete('/:postId', requireAuth, deletePost);

module.exports = postRouter;
