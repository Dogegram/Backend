const User = require('../models/User');
const Post = require('../models/Post');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const ObjectId = require('mongoose').Types.ObjectId;
const fs = require('fs');
const crypto = require('crypto');
const formidable = require('formidable');
const { v4: uuidv4 } = require('uuid');
var mime = require('mime-types');
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const Minio = require('minio');
const jwt = require('jsonwebtoken');
const linkifyHtml = require('linkifyjs/html');
require('linkifyjs/plugins/hashtag');
require('linkifyjs/plugins/mention');
const { parse } = require('node-html-parser');
var xss = require("xss");
const fetch = require("node-fetch")
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { sendVerificationBadgeEmail, sendWhisperEmail } = require('../utils/controllerUtils');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const { scanNSFW, checkText } = require('./helpers/tensorflow')
const { compress } = require('./helpers/compress')
const { upload } = require('./helpers/upload')

const { customAlphabet } = require('nanoid');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6);

const twofactor = require("node-2fa");

var encodify = require('encodify');

const algorithm = 'aes-256-ctr';
const secretKey = process.env.ENC_KEY;


const s3Bucket = process.env.S3_BUCKET;


const {
  validateEmail,
  validateFullName,
  validateUsername,
  validateBio,
  validateWebsite,
} = require('../utils/validation');
const { sendConfirmationEmail } = require('../utils/controllerUtils');

module.exports.retrieveUser = async (req, res, next) => {
  const { username } = req.params;
  const requestingUser = res.locals.user;
  try {
    const user = await User.findOne(
      { username },
      'username fullName avatar bio banned fullName _id website verified youtuber ytlink stripe_account_id creator_payout_enabled payments_enabled'
    );
    if (!user || user.banned) {
      return res
        .status(404)
        .send({ error: 'Could not find a user with that username.' });
    }

    const posts = await Post.aggregate([
      {
        $facet: {
          data: [
            { $match: { author: ObjectId(user._id) } },
            { $sort: { date: -1 } },
            { $limit: 12 },
            {
              $lookup: {
                from: 'postvotes',
                localField: '_id',
                foreignField: 'post',
                as: 'postvotes',
              },
            },
            {
              $lookup: {
                from: 'comments',
                localField: '_id',
                foreignField: 'post',
                as: 'comments',
              },
            },
            {
              $lookup: {
                from: 'commentreplies',
                localField: 'comments._id',
                foreignField: 'parentComment',
                as: 'commentReplies',
              },
            },
            {
              $unwind: '$postvotes',
            },
            {
              $addFields: { image: '$image' },
            },
            {
              $project: {
                user: true,
                followers: true,
                following: true,
                comments: {
                  $sum: [{ $size: '$comments' }, { $size: '$commentReplies' }],
                },
                image: true,
                filter: true,
                caption: true,
                author: true,
                postVotes: { $size: '$postvotes.votes' },
              },
            },
          ],
          postCount: [
            { $match: { author: ObjectId(user._id) } },
            { $count: 'postCount' },
          ],
        },
      },
      { $unwind: '$postCount' },
      {
        $project: {
          data: true,
          postCount: '$postCount.postCount',
        },
      },
    ]);
    console.log(user)

    var followersProjectObj = { count: { $size: "$followers" }, };
    if (requestingUser && requestingUser._id.toString() != user._id.toString()) {
      followersProjectObj.isFollowing = { $in: [requestingUser._id, "$followers"] };
    }
    //the best way to do this, less bandwidth (somehow this is taking more time to process)
    const followersDocument = await Followers.aggregate([{ $match: { user: user._id } }, { $project: followersProjectObj },]);
    //console.log(followersDocument)
    const followingDocument = await Following.aggregate([{ $match: { user: user._id } }, { $project: { count: { $size: "$following" } } }])
    //console.log(followingDocument)
    var isUserFollowing = false;
    if (requestingUser && requestingUser._id.toString() != user._id.toString()) {
      const userFollowingDocument = await Following.find({ user: requestingUser._id });
      console.log(userFollowingDocument)
      if (userFollowingDocument[0].following.find(e => String(e.user) === String(user._id)) != undefined) {
        isUserFollowing = true;
      }
    }

    console.log(isUserFollowing)
    return res.send({
      user,
      followers: followersDocument[0].count,
      following: followingDocument[0].count,
      // Check if the requesting user follows the retrieved user 
      isFollowing: requestingUser && isUserFollowing,
      posts: posts[0],
    });
  } catch (err) {
    next(err);
  }
};

module.exports.trackLinks = async (req, res, next) => {
  console.log(req.headers)
  res.send("good browser :)")
}

module.exports.sendWhisper = async (req, res, next) => {
  //shhhhh....
  // send a notification to the user when they receive a wisper
  const { user } = res.locals;
  const { message } = req.body;
  const { username } = req.params;
  const userToSendTo = await User.findOne({ username }, { _id: 1, email: 1, whisperEmail: 1 });
  //check message length against 200 characters limit
  if (message.length === 0) {
    return res.status(400).send({ error: 'Bruh. Message cannot be empty.' });
  }
  if (message.length > 200) {
    return res.status(400).send({ error: 'Message too long?!?! (we know you bypassed our frontend (9_9) )' });
  }
  //just in case the user doesn't exist and some hecker dude just tried to pwn us
  if (!userToSendTo) {
    return res.status(404).send({ error: 'User not found' });
  }
  const notification = new Notification({
    sender: user._id,
    receiver: userToSendTo._id,
    notificationData: { message: message },
    notificationType: 'whisper',
  });
  await notification.save();
  if (userToSendTo.whisperEmail) {
    await sendWhisperEmail(user.username, userToSendTo.email, message);
  }
  res.send({ message: 'Shh, Whisper sent!' });
}

module.exports.creatorConnectJoin = async (req, res, next) => {
  const { atoken } = req.body;
  const requestingUser = res.locals.user;
  const username = requestingUser.username
  try {
    var request = await fetch(`https://www.googleapis.com/youtube/v3/channels?mine=true&part=statistics&access_token=${atoken}&key=${process.env.YOUTUBE_DATA_KEY}`);
    var response = await request.json()
    var cdata = response.items[0]
    if (!cdata.statistics.hiddenSubscriberCount) {
      var subCount = cdata.statistics.subscriberCount;
      var cid = cdata.id;
      if (subCount > 100) {
        console.log("here too?")
        const userCreatorUpdate = await User.updateOne({
          username: username
        },
          {
            $set: { youtuber: true, ytlink: `https://www.youtube.com/channel/${cid}` }
          });

        console.log(userCreatorUpdate)
        if (!userCreatorUpdate.acknowledged) {
          if (!userCreatorUpdate.ok) {
            return res.status(500).send({ error: 'Could not give User Creator badge.' });
          }
        }

        return res.send({ success: true, message: "Congratulations! You have made it here, you are now a creator connect member. Refresh this page to see the updated magic!" });
      } else {
        return res.status(400).send({ success: false, message: "Sorry, but you have less than 100 subscribers :(" })
      }
    } else {

      return res.status(400).send({ success: false, message: "Your subscriber count was hidden thus we can't verify this request. Please contact support at creatorsupport@dogegram.xyz" })
    }
  } catch (err) {
    return res.status(500).send({ success: false, message: err.message })
  }
  res.status(500).send({ success: false, message: "Ah crap, some bug hit us" })

}

module.exports.retrieveUserDetails = async (req, res, next) => {
  const { username } = req.params;
  try {
    const user = await User.findOne(
      { username },
      'fullName avatar bio'
    );
    if (!user) {
      return res
        .status(404)
        .send({ error: 'Could not find a user with that username.' });
    }

    var meta = {};
    meta.avatar = user.avatar;
    meta.name = user.fullName;
    meta.bio = user.bio ? user.bio : null;
    console.log(user)

    return res.send(meta);
  } catch (err) {
    next(err);
  }
};

module.exports.retrievePosts = async (req, res, next) => {
  // Retrieve a user's posts with the post's comments & likes
  const { username, offset = 0 } = req.params;
  try {
    const posts = await Post.aggregate([
      { $sort: { date: -1 } },
      { $skip: Number(offset) },
      { $limit: 12 },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $match: { 'user.username': username } },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          as: 'comments',
        },
      },
      {
        $lookup: {
          from: 'postvotes',
          localField: '_id',
          foreignField: 'post',
          as: 'postVotes',
        },
      },
      { $unwind: '$postVotes' },
      {
        $project: {
          image: true,
          caption: true,
          date: true,
          'user.username': true,
          'user.avatar': true,
          comments: { $size: '$comments' },
          postVotes: { $size: '$postVotes.votes' },
        },
      },
    ]);
    if (posts.length === 0) {
      return res.status(404).send({ error: 'Could not find any posts.' });
    }
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};


module.exports.verifyUser = async (req, res, next) => {
  const { username } = req.params;
  const requestingUser = res.locals.user;

  try {
    const user = await User.findOne(
      { username: username },
    );
    if (!requestingUser.admin) return res.status(401).send({ error: 'Not Authorized' })
    if (!user) {
      return res
        .status(404)
        .send({ error: 'Could not find a user with that username.' });
    }



    const userVerifyUpdate = await User.updateOne({
      username: username
    },
      {
        $set: { verified: true }
      });

    console.log(userVerifyUpdate)
    if (!userVerifyUpdate.acknowledged) {
      if (!userVerifyUpdate.ok) {
        return res.status(500).send({ error: 'Could not give User Verification badge.' });
      }
      // The above query did not modify anything meaning that the user has already bookmarked the post
      // Remove the bookmark instead
      const userRemoveVerifyUpdate = await User.updateOne({
        username: username
      },
        {
          $set: { verified: undefined }
        });
      if (!userRemoveVerifyUpdate.acknowledge) {
        return res.status(500).send({ error: 'Could not remove User Verification badge.' });
      }
      return res.send({ success: true, operation: 'un-verify' });
    }
    await sendVerificationBadgeEmail(username, user.email)
    return res.send({ success: true, operation: 'verify' });
  } catch (err) {
    next(err);
  }
};


module.exports.followUser = async (req, res, next) => {
  const { userId } = req.params;
  const user = res.locals.user;

  try {
    const userToFollow = await User.findById(userId);
    if (!userToFollow) {
      return res
        .status(400)
        .send({ error: 'Could not find a user with that id.' });
    }

    const followerUpdate = await Followers.updateOne(
      { user: userId, 'followers.user': { $ne: user._id } },
      { $push: { followers: { user: user._id } } }
    );

    const followingUpdate = await Following.updateOne(
      { user: user._id, 'following.user': { $ne: userId } },
      { $push: { following: { user: userId } } }
    );

    console.log(followerUpdate)
    if (followerUpdate.modifiedCount === 0 || followingUpdate.modifiedCount === 0) {
      if (!followerUpdate.acknowledged || !followingUpdate.acknowledged) {
        return res
          .status(500)
          .send({ error: 'Could not follow user please try again later.' });
      }
      // Nothing was modified in the above query meaning that the user is already following
      // Unfollow instead
      const followerUnfollowUpdate = await Followers.updateOne(
        {
          user: userId,
        },
        { $pull: { followers: { user: user._id } } }
      );

      const followingUnfollowUpdate = await Following.updateOne(
        { user: user._id },
        { $pull: { following: { user: userId } } }
      );
      if (!followerUnfollowUpdate.acknowledged || !followingUnfollowUpdate.acknowledged) {
        return res
          .status(500)
          .send({ error: 'Could not unfollow user please try again later.' });
      }
      return res.send({ success: true, operation: 'unfollow' });
    }

    const notification = new Notification({
      notificationType: 'follow',
      sender: user._id,
      receiver: userId,
      date: Date.now(),
    });

    const sender = await User.findById(user._id, 'username avatar');
    const isFollowing = await Following.findOne({
      user: userId,
      'following.user': user._id,
    });

    await notification.save();
    socketHandler.sendNotification(req, {
      notificationType: 'follow',
      sender: {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar,
      },
      receiver: userId,
      date: notification.date,
      isFollowing: !!isFollowing,
    });

    res.send({ success: true, operation: 'follow' });
  } catch (err) {
    next(err);
  }
};

/**
 * Retrieves either who a specific user follows or who is following the user.
 * Also retrieves whether the requesting user is following the returned users
 * @function retrieveRelatedUsers
 * @param {object} user The user object passed on from other middlewares
 * @param {string} userId Id of the user to be used in the query
 * @param {number} offset The offset for how many documents to skip
 * @param {boolean} followers Whether to query who is following the user or who the user follows default is the latter
 * @returns {array} Array of users
 */
const retrieveRelatedUsers = async (user, userId, offset, followers) => {
  const pipeline = [
    {
      $match: { user: ObjectId(userId) },
    },
    {
      $lookup: {
        from: 'users',
        let: followers
          ? { userId: '$followers.user' }
          : { userId: '$following.user' },
        pipeline: [
          {
            $match: {
              // Using the $in operator instead of the $eq
              // operator because we can't coerce the types
              $expr: { $in: ['$_id', '$$userId'] },
            },
          },
          {
            $skip: Number(offset),
          },
          {
            $limit: 10,
          },
        ],
        as: 'users',
      },
    },
    {
      $lookup: {
        from: 'followers',
        localField: 'users._id',
        foreignField: 'user',
        as: 'userFollowers',
      },
    },
    {
      $project: {
        'users._id': true,
        'users.username': true,
        'users.avatar': true,
        'users.fullName': true,
        userFollowers: true,
      },
    },
  ];

  const aggregation = followers
    ? await Followers.aggregate(pipeline)
    : await Following.aggregate(pipeline);

  // Make a set to store the IDs of the followed users
  const followedUsers = new Set();
  // Loop through every follower and add the id to the set if the user's id is in the array
  aggregation[0].userFollowers.forEach((followingUser) => {
    if (
      !!followingUser.followers.find(
        (follower) => String(follower.user) === String(user._id)
      )
    ) {
      followedUsers.add(String(followingUser.user));
    }
  });
  // Add the isFollowing key to the following object with a value
  // depending on the outcome of the loop above
  aggregation[0].users.forEach((followingUser) => {
    followingUser.isFollowing = followedUsers.has(String(followingUser._id));
  });

  return aggregation[0].users;
};

module.exports.retrieveFollowing = async (req, res, next) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;
  try {
    const users = await retrieveRelatedUsers(user, userId, offset);
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveFollowers = async (req, res, next) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;

  try {
    const users = await retrieveRelatedUsers(user, userId, offset, true);
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.searchUsers = async (req, res, next) => {
  const { username, offset = 0 } = req.params;
  if (!username) {
    return res
      .status(400)
      .send({ error: 'Please provide a user to search for.' });
  }

  try {
    const users = await User.aggregate([
      {
        $match: {
          username: { $regex: new RegExp(username.toString()), $options: 'i' },
        },
      },
      {
        $lookup: {
          from: 'followers',
          localField: '_id',
          foreignField: 'user',
          as: 'followers',
        },
      },
      {
        $unwind: '$followers',
      },
      {
        $addFields: {
          followersCount: { $size: '$followers.followers' },
        },
      },
      {
        $sort: { followersCount: -1 },
      },
      {
        $skip: Number(offset),
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: true,
          username: true,
          avatar: true,
          fullName: true,
        },
      },
    ]);
    if (users.length === 0) {
      return res
        .status(404)
        .send({ error: 'Could not find any users matching the criteria.' });
    }
    return res.send(users);
  } catch (err) {
    next(err);
  }
};

module.exports.getTwoFactorAuth = async (req, res, next) => {
  const user = res.locals.user;

  if (user.twofactor) {
    return res.status(401).send({ done: false, message: 'Turn off 2FA to regenrate codes!' })
  }

  const newSecret = twofactor.generateSecret({ name: "Dogegram", account: user.email });

  console.log(newSecret)
  /*
    try{
  
    const userDocument = await User.findOne({ _id: user._id });
  
    user
  
  }catch(err){
   throw new Error(err)       
  }
  */

  /**
   * Genrates 2FA backup codes
   * @function genrateBackupCodes2FA
   * @param {number} howMany The amount of codes you want
   * @returns {Object} An Object containg a Array of codes & their interpretation in NATO phonetics
   */

  const genrateBackupCodes2FA = (howMany) => {


    let current = 1
    let codes = []

    while (current <= howMany) {
      console.log(current)

      let code = nanoid()
      codes.push(code)
      current += 1
    }
    let natocodes = []
    codes.forEach((data, index) => {
      let natocode = encodify.toNATOCode(data)
      natocodes.push(natocode)
    })

    let obj = {
      codes: codes,
      nato: natocodes
    }

    return obj

  }

  var recoveryCodes = genrateBackupCodes2FA(3)

  console.log(recoveryCodes)

  try {

    var userdoc = await User.findOne({ _id: user._id })
    userdoc.recovery2fa = recoveryCodes.codes
    userdoc.secret2fa = newSecret.secret
    await userdoc.save()
  } catch (err) {
    throw new Error(err)
  }
  res.status(200).send({ done: true, secretKey: newSecret.secret, qr: newSecret.qr, recovery: recoveryCodes })

}

module.exports.confirm2FA = async (req, res, next) => {
  const { twofactorCode } = req.body;
  const user = res.locals.user;

  const userdoc = await User.findOne({ _id: user._id }, { secret2fa: 1, _id: 0 })
  console.log(userdoc)


  const isright = twofactor.verifyToken(userdoc.secret2fa, twofactorCode);

  if (isright === null) {
    return res.status(401).send({ done: false, message: 'the code given is incorrect. please try again' })
  } else if (isright.delta === 0) {
    return res.status(200).send({ done: true, message: 'the code given is correct. great!' })
  } else {
    return res.status(400).send({ done: false, message: 'the code given is late/early. please try again' })
  }
  return res.status(500).send({ done: false, message: 'you should not ever reach here, if you do then ' })
}

module.exports.turnOn2FA = async (req, res, next) => {
  const user = res.locals.user;
  if (user.twofactor) {
    return res.status(200).send({ done: false, message: "you have 2fa turned on already!?!?!" })
  }
  try {
    var userdoc = await User.findOne({ _id: user._id })
    userdoc.twofactor = true
    userdoc.save()
  } catch (err) {
    throw new Error(err)
  }
  res.status(200).send({ done: true, message: "2FA set! hopefully you have a good time :)" })
}

module.exports.turnOff2FA = async (req, res, next) => {
  const user = res.locals.user;
  if (user.twofactor) {
    try {
      var userdoc = await User.findOne({ _id: user._id })
      userdoc.twofactor = false
      userdoc.save()
    } catch (err) {
      throw new Error(err)
    }
  } else {
    return res.status(400).send({ done: false, message: "you have 2fa not set already?!?!?" })
  }
  return res.status(200).send({ done: true, message: "2FA unset! hopefully you have a good time (same as you started) :)" })
}

module.exports.confirmUser = async (req, res, next) => {
  const { token } = req.body;
  const user = res.locals.user;

  try {
    console.log(token)
    if (!token) {
      return res
        .status(404)
        .send({ error: "wtf! you didn't send any token -__-" });
    }

    var dtoken = jwt.verify(token, process.env.JWT_SECRET);

    console.log(dtoken);

    username = dtoken.username;
    fullName = dtoken.fullName;
    email = dtoken.email;
    pronoun = dtoken.pronoun;
    birthday = new Date(dtoken.birthday);
    password = dtoken.password;


    const userd = new User({ username, fullName, pronoun, birthday, email, password });

    await userd.save();

    return res.send({ success: true });

  } catch (err) {
    console.log(err)
    next(err);
  }
};

module.exports.changeAvatar = async (req, res, next) => {
  const user = res.locals.user;

  console.log(user)

  const form = formidable({ multiples: true });
  form.parse(req, async (err, fields, files) => {
    console.log(files)
    if (!files) {
      return res
        .status(400)
        .send({ error: 'Please provide the image to upload.' });
    }



    try {
      const myfile = files.image;
      fs.readFile(myfile.path, async (err, imagebuf) => {
        var nsfw = await scanNSFW(imagebuf)

        if (nsfw) {
          return res.status(401).send({ success: false, message: "This file has been detected NSFW by our systems, please don't post these things here" });
        }

        var compressedImage = await compress(imagebuf, 80)

        var tag = crypto.createHash('sha1').update(compressedImage).digest("hex");
        const s3error = (err) => {throw new Error('err with s3 upload', err)}
        const params = {
          Bucket: s3Bucket,
          Key: tag,
          Body: compressedImage,
          ACL: 'public-read',
          CacheControl: '7776000000',
          ContentType: 'image/webp',
          Metadata: {
            'x-amz-acl': 'public-read'
          }
        };
        await upload(params, s3error)
        const avatarUpdate = await User.updateOne(
          { _id: user._id },
          { $set: { avatar: tag } }
        );
        if (!avatarUpdate.acknowledged) {
          next(err);
        }
        return res.status(204).send();
      });
    } catch (err) {
      next(err);
    }
  });
};

module.exports.removeAvatar = async (req, res, next) => {
  const user = res.locals.user;

  try {
    const avatarUpdate = await User.updateOne(
      { _id: user._id },
      { $unset: { avatar: '' } }
    );
    if (!avatarUpdate.acknowledged) {
      next(err);
    }
    return res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports.updateProfile = async (req, res, next) => {
  const user = res.locals.user;
  const { fullName, username, website, bio, email, whisperEmail } = req.body;
  let confirmationToken = undefined;
  let updatedFields = {};
  try {
    const userDocument = await User.findOne({ _id: user._id });


    if (fullName === userDocument.fullName && username === userDocument.username && website === userDocument.website && bio === userDocument.rawBio && whisperEmail === userDocument.whisperEmail) {
      return res.status(400).send({ error: "At least change some things, add something new or fix any typo. Do something." });
    }

    if (typeof whisperEmail != 'boolean') {
      return res.status(400).send({ error: "Don't try to pwn us you idiot, error: whisper email should be an boolean" });
    }

    if (fullName) {
      const fullNameError = validateFullName(fullName);
      if (fullNameError) return res.status(400).send({ error: fullNameError });
      userDocument.fullName = fullName;
      updatedFields.fullName = fullName;
    }

    if (username) {
      const usernameError = validateUsername(username);
      if (usernameError) return res.status(400).send({ error: usernameError });
      // Make sure the username to update to is not the current one
      if (username !== user.username) {
        const existingUser = await User.findOne({ username: { $eq: username } });
        if (existingUser)
          return res
            .status(400)
            .send({ error: 'Please choose another username.' });
        userDocument.username = username;
        updatedFields.username = username;
      }
    }
    console.log(website)

    if (website) {
      const websiteError = validateWebsite(website);
      if (websiteError) return res.status(400).send({ error: websiteError });
      if (!website.includes('http://') && !website.includes('https://')) {
        userDocument.website = 'https://' + website;
        updatedFields.website = 'https://' + website;
      } else {
        userDocument.website = website;
        updatedFields.website = website;
      }
    } else {
      userDocument.website = undefined;
      updatedFields.website = undefined;
    }

    if (bio) {
      const bioError = validateBio(bio);

      if (bioError) return res.status(400).send({ error: bioError });

      const biohtml = linkifyHtml(bio, {
        defaultProtocol: 'https',
        className: 'heading-3 link font-bold',
        target: '_blank',
        format: {
          url: function (value) {
            return value.length > 40 ? value.slice(0, 40) + '…' : value
          }
        },
        attributes: {
          target: {
            url: '_blank',
          },
        }
      });


      noxsshtml = DOMPurify.sanitize(biohtml);

      html = parse(biohtml);
      //hacky solution to add the target to the links
      withtarget = noxsshtml.replace(/id="/g, 'target="')

      console.log(withtarget)

      userDocument.bio = withtarget
      userDocument.rawBio = DOMPurify.sanitize(bio)
      updatedFields.bio = withtarget
      updatedFields.rawBio = DOMPurify.sanitize(bio)
    } else {
      userDocument.bio = undefined;
      userDocument.rawBio = undefined;
      updatedFields.bio = undefined;
      updatedFields.rawBio = undefined;
    }

    if (whisperEmail != undefined) {
      userDocument.whisperEmail = whisperEmail;
      updatedFields.whisperEmail = whisperEmail;
    }

    /*
    if (email) {
      const emailError = validateEmail(email);
      if (emailError) return res.status(400).send({ error: emailError });
      // Make sure the email to update to is not the current one
      if (email !== user.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser)
          return res
            .status(400)
            .send({ error: 'Please choose another email.' });
        confirmationToken = new ConfirmationToken({
          user: user._id,
          token: crypto.randomBytes(20).toString('hex'),
        });
        await confirmationToken.save();
        userDocument.email = email;
        userDocument.confirmed = false;
        updatedFields = { ...updatedFields, email, confirmed: false };
      }
    } else {
      return res
      .status(400)
      .send({ error: 'Empty Email Not Allowed.' });
    }
*/



    const updatedUser = await userDocument.save();
    res.send(updatedFields);
    /*  if (email && email !== user.email) {
        sendConfirmationEmail(
          updatedUser.username,
          updatedUser.email,
          confirmationToken.token
        );
      }*/
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveSuggestedUsers = async (req, res, next) => {
  const { max } = req.params;
  const user = res.locals.user;
  console.log("start?")
  try {
    const users = await User.aggregate([
      {
        $match: { _id: { $ne: ObjectId(user._id) } },
      },
      {
        $lookup: {
          from: 'followers',
          localField: '_id',
          foreignField: 'user',
          as: 'followers',
        },
      },
      {
        $lookup: {
          from: 'posts',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$author', '$$userId'],
                },
              },
            },
            {
              $sort: { date: -1 },
            },
            {
              $limit: 3,
            },
          ],
          as: 'posts',
        },
      },
      {
        $unwind: '$followers',
      },
      {
        $project: {
          username: true,
          fullName: true,
          avatar: true,
          isFollowing: { $in: [user._id, '$followers.followers.user'] },
          youtuber: true,
          posts: true,
        },
      },
      {
        $match: { isFollowing: false },
      },
      {
        $sample: { size: max ? Number(max) : 20 },
      },
      {
        $sort: { posts: -1 },
      },
      {
        $unset: ['isFollowing'],
      },
    ]);
    res.send(users);
  } catch (err) {
    next(err);
  }
};
