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
  creatorConnectJoin,
  getTwoFactorAuth,
  confirm2FA,
  turnOn2FA,
  turnOff2FA,
  sendWhisper
} = require('../controllers/userController');
const { requireAuth, optionalAuth } = require('../controllers/authController');


const followLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 70,
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
}); 

const avatarLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 7,
  keyGenerator:(req)=>{
    req.header("cf-connecting-ip")
  }
});


userRouter.get('/suggested/:max?', requireAuth, retrieveSuggestedUsers);
userRouter.post('/track', trackLinks);
userRouter.post('/joinCreatorConnect', requireAuth, creatorConnectJoin );
userRouter.get('/2fa/join', requireAuth, getTwoFactorAuth );
userRouter.get('/2fa/set', requireAuth, turnOn2FA );
userRouter.get('/2fa/unset', requireAuth, turnOff2FA );
userRouter.post('/2fa/check', requireAuth, confirm2FA);
userRouter.post('/whisper/:username', requireAuth, sendWhisper);
//internal use only
userRouter.get('/internal/meta/:username', retrieveUserDetails);
userRouter.get('/internal/verify/:username', requireAuth, verifyUser);
// end internal use
userRouter.get('/:username', optionalAuth, retrieveUser);
userRouter.get('/:username/posts/:offset', retrievePosts);
userRouter.get('/:userId/:offset/following', requireAuth, retrieveFollowing);
userRouter.get('/:userId/:offset/followers', requireAuth, retrieveFollowers);
userRouter.get('/:username/:offset/search', searchLimiter, searchUsers);
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
