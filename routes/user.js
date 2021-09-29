const express = require('express');
const userRouter = express.Router();
const rateLimit = require('express-rate-limit');

const {
  retrieveUser,
  retrievePosts,
  followUser,
  retrieveFollowing,
  retrieveFollowers,
  searchUsers,
  confirmUser,
  changeAvatar,
  removeAvatar,
  updateProfile,
  retrieveSuggestedUsers,
  retrieveUserDetails,
  trackLinks,
  verifyUser,
  creatorConnectJoin
} = require('../controllers/userController');
const { requireAuth, optionalAuth } = require('../controllers/authController');


const followLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 70
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50
}); 

const avatarLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 7 
});


userRouter.get('/suggested/:max?', requireAuth, retrieveSuggestedUsers);
userRouter.post('/track', trackLinks);
userRouter.post('/joinCreatorConnect',requireAuth, creatorConnectJoin );
//internal use only
userRouter.get('/internal/meta/:username', retrieveUserDetails);
userRouter.get('/internal/verify/:username', requireAuth, verifyUser);
// end internal use
userRouter.get('/:username', optionalAuth, retrieveUser);
userRouter.get('/:username/posts/:offset', retrievePosts);
userRouter.get('/:userId/:offset/following', requireAuth, retrieveFollowing);
userRouter.get('/:userId/:offset/followers', requireAuth, retrieveFollowers);
userRouter.get('/:username/:offset/search',searchLimiter, searchUsers);

userRouter.post('/confirm', confirmUser);
userRouter.post(
  '/avatar',
  avatarLimiter,
  requireAuth,
  changeAvatar
);
userRouter.put('/', avatarLimiter, requireAuth, updateProfile);

userRouter.delete('/avatar', requireAuth, removeAvatar);

userRouter.post('/:userId/follow', followLimiter, requireAuth, followUser);

module.exports = userRouter;
