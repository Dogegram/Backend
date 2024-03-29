const linkify = require('linkifyjs');
require('linkifyjs/plugins/hashtag')(linkify);
const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Following = require('../models/Following');
const Followers = require('../models/Followers');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const ObjectId = require('mongoose').Types.ObjectId;
const fetch = require('node-fetch');
const crypto = require('crypto');
const { scanNSFW, checkText } = require('./helpers/tensorflow')
const { compress } = require('./helpers/compress')
const { upload } = require('./helpers/upload')
const AWS = require('aws-sdk');
const s3Bucket = process.env.S3_BUCKET;

/*
const redis = require("redis");
const client = redis.createClient({url:process.env.REDIS_URL});

client.on("error", function(error) {
  console.error(error);
});


const testredis = async () => {
  client.get('a', (error, data)=>{
    if(error===undefined||error===null){
    return data
    } else {
      throw new Error(error)
    }
  });
}
testredis()

*/





const {
  retrieveComments,
  populatePostsPipeline,
} = require('../utils/controllerUtils');
const filters = require('../utils/filters');

module.exports.createPost = async (req, res, next) => {
  const user = res.locals.user;
  const { caption, postText, filter: filterName, image } = req.body;

  let post = undefined;
  const filterObject = filters.find((filter) => filter.name === filterName);
  const hashtags = [];
  linkify.find(caption).forEach((result) => {
    if (result.type === 'hashtag') {
      hashtags.push(result.value.substring(1));
    }
    if (result.type === 'link') {

    }
  });

  if (!image) {
    return res
      .status(400)
      .send({ success: false, message: 'Please provide the image to upload.' });
  }


  try {
    const imagebuf = Buffer.from(image.split(';base64,').pop(), 'base64')
    if(imagebuf.length > 3*1e+6) {
      delete imagebuf
      return res.status(400).send({success: false, message: 'File too big, please keep it under 3 mb'});
    }
    
    var nsfw = await scanNSFW(imagebuf)
    var captionCheck = await checkText(caption);

    if (nsfw) {
      return res.status(401).send({ success: false, message: "This file has been detected NSFW by our systems. Posting Aborted." });
    } else if(captionCheck){
      return res.status(401).send({ success: false, message: "This caption is Toxic (its experimental so please sorry for any inconvenience). Posting Aborted." });
    }
    var compressedImage = await compress(imagebuf)
    var tag = crypto.createHash('sha1').update(compressedImage).digest("hex");
    console.log(tag)


    var imagebase64 = compressedImage.toString('base64');
    var imgdata = 'data:image/webp;base64,' + imagebase64;

    var cdnURL = `https://${process.env.S3_BUCKET}/` + tag

    var reqCheckFile = await fetch(cdnURL)
    var resCheckFile = reqCheckFile.status
    console.log(resCheckFile)

    const s3error = () => {throw new Error('err with s3 upload')}
   

    if (resCheckFile != 200) {
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

      // Uploading files to the bucket
      const uploaded = await upload(params, s3error)
      console.log(uploaded)

    }

    post = await Post.create({
      image: tag,
      filter: filterObject ? filterObject.filter : '',
      caption,
      author: user._id,
      hashtags,
      postText
    });


    const postVote = new PostVote({
      post: post._id,
    });
    await post.save();
    await postVote.save();
    var sendata = {
      ...post.toObject(),
      postVotes: [],
      comments: [],
      author: { avatar: user.avatar, username: user.username },
    }

    sendata.image = imgdata;

    res.status(201).send(sendata);
    // })

    if (post != undefined) {

      try {
        // Updating followers feed with post
        const followersDocument = await Followers.find({ user: user._id });
        const followers = followersDocument[0].followers;
        const postObject = {
          ...post.toObject(),
          author: { username: user.username, avatar: user.avatar },
          commentData: { commentCount: 0, comments: [] },
          postVotes: [],
        };

        socketHandler.sendPost(req, postObject, user._id);
        
    /*    followers.forEach((follower) => {
          socketHandler.sendPost(
            req,
            // Since the post is new there is no need to look up any fields
            postObject,
            follower.user
          );
        }); */
      } catch (err) {
        console.log(err);
      }
    };
  } catch (err) {
    next(err);
  }
};

module.exports.retrievePostDetails = async (req, res, next) => {
  const { postId } = req.params;
  if (postId.length != 24) {
    return res.status(400).send({ error: 'ID is invalid' })
  }
  console.log(postId)
  try {
    const post = await Post.findOne(
      { _id: ObjectId(postId) },
      'caption image author'
    ).populate('author', 'fullName username');
    if (!post) {
      return res
        .status(404)
        .send({ error: 'Could not find a post with that id.' });
    }
    var meta = {};
    meta.image = post.image;
    meta.name = post.author.fullName;
    meta.userName = post.author.username;
    meta.caption = post.caption ? post.caption : 'Just chilling...';
    console.log(post)

    return res.send(meta);
  } catch (err) {
    next(err);
  }
};

module.exports.deletePost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    const post = await Post.findOne({ _id: postId, author: user._id });
    if (!post) {
      return res.status(404).send({
        error: 'Could not find a post with that id associated with the user.',
      });
    }
    // This uses pre hooks to delete everything associated with this post i.e comments
    const postDelete = await Post.deleteOne({
      _id: postId,
    });
    if (!postDelete.deletedCount) {
      return res.status(500).send({ error: 'Could not delete the post.' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }

  try {
    const followersDocument = await Followers.find({ user: user._id });
    const followers = followersDocument[0].followers;
    socketHandler.deletePost(req, postId, user._id);
    followers.forEach((follower) =>
      socketHandler.deletePost(req, postId, follower.user)
    );
  } catch (err) {
    console.log(err);
  }
};

module.exports.retrievePost = async (req, res, next) => {
  const { postId } = req.params;
  try {
    // Retrieve the post and the post's votes
    const post = await Post.aggregate([
      { $match: { _id: ObjectId(postId) } },
      {
        $lookup: {
          from: 'postvotes',
          localField: '_id',
          foreignField: 'post',
          as: 'postVotes',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
        },
      },
      { $unwind: '$author' },
      { $unwind: '$postVotes' },
      {
        $unset: [
          'author.password',
          'author.email',
          'author.private',
          'author.bio',
        ],
      },
      {
        $addFields: { postVotes: '$postVotes.votes' },
      },
    ]);
    if (post.length === 0) {
      return res
        .status(404)
        .send({ error: 'Could not find a post with that id.' });
    }
    // Retrieve the comments associated with the post aswell as the comment's replies and votes
    const comments = await retrieveComments(postId, 0);

    return res.send({ ...post[0], commentData: comments });
  } catch (err) {
    next(err);
  }
};

module.exports.votePost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    // Update the vote array if the user has not already liked the post
    const postLikeUpdate = await PostVote.updateOne(
      { post: postId, 'votes.author': { $ne: user._id } },
      {
        $push: { votes: { author: user._id } },
      }
    );
    console.log(postLikeUpdate)
    if (postLikeUpdate.modifiedCount === 0) {
      if (!postLikeUpdate.acknowledged) {
        console.log('like post: ', postLikeUpdate.acknowledged)
        return res.status(500).send({ error: 'Could not vote on the post. 1' });
      }
      // Nothing was modified in the previous query meaning that the user has already liked the post
      // Remove the user's like
      const postDislikeUpdate = await PostVote.updateOne(
        { post: postId },
        { $pull: { votes: { author: user._id } } }
      );

      console.log('dislike post: ', postDislikeUpdate)

      if (postDislikeUpdate.modifiedCount === 0) {
        return res.status(500).send({ error: 'Could not vote on the post. 2' });
      }
    } else {
      // Sending a like notification
      const post = await Post.findById(postId);
      if (String(post.author) !== String(user._id)) {
        const image = post.image;
        const notification = new Notification({
          sender: user._id,
          receiver: post.author,
          notificationType: 'like',
          date: Date.now(),
          notificationData: {
            postId,
            image,
            filter: post.filter,
          },
        });

        await notification.save();
        socketHandler.sendNotification(req, {
          ...notification.toObject(),
          sender: {
            _id: user._id,
            username: user.username,
            avatar: user.avatar,
          },
        });
      }
    }
    return res.send({ success: true });
  } catch (err) {
    console.log(err)
    next(err);
  }
};

module.exports.retrievePostFeed = async (req, res, next) => {
  const user = res.locals.user;
  var offset = req.params.offset;

  try {
    const followingDocument = await Following.findOne({ user: user._id });
    if (!followingDocument) {
      return res.status(404).send({ error: 'Could not find any posts.' });
    }
    const following = followingDocument.following.map(
      (following) => following.user
    );
    let adset = 0

    // Fields to not include on the user object
    const unwantedUserFields = [
      'author.password',
      'author.private',
      'author.bookmarks',
      'author.email',
      'author.website',
      'author.bio',
      'author.rawBio',
      'author.countryblocks',
      'author.birthday',
      'author.admin',
      'author.banned',
    ];


    /*  if(offset > 7){
        return res.status(400).send({success:false, error:"Bad Request, feed value too large"})
      }
  
      if(offset != 0 && offset != undefined){
      if(offset%6===0){
        offset -= 1
        adset = offset -1
      }
      if(offset%7==0){
        offset -= 2
        adset= offset - 2
      }
    }*/

    var posts = await Post.aggregate([
      {
        $match: {
          $or: [{ author: { $in: following } }, { author: ObjectId(user._id) }],
        },
      },
      { $sort: { date: -1 } },
      { $skip: Number(offset) },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
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
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              // Finding comments related to the postId
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 3 },
            // Populating the author field
            {
              $lookup: {
                from: 'users',
                localField: 'author',
                foreignField: '_id',
                as: 'author',
              },
            },
            {
              $lookup: {
                from: 'commentvotes',
                localField: '_id',
                foreignField: 'comment',
                as: 'commentVotes',
              },
            },
            {
              $unwind: '$author',
            },
            {
              $unwind: {
                path: '$commentVotes',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unset: unwantedUserFields,
            },
            {
              $addFields: {
                commentVotes: '$commentVotes.votes',
              },
            },
          ],
          as: 'comments',
        },
      },
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            {
              $group: { _id: null, count: { $sum: 1 } },
            },
            {
              $project: {
                _id: false,
              },
            },
          ],
          as: 'commentCount',
        },
      },
      {
        $unwind: {
          path: '$commentCount',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: '$postVotes',
      },
      {
        $unwind: '$author',
      },
      {
        $addFields: {
          postVotes: '$postVotes.votes',
          commentData: {
            comments: '$comments',
            commentCount: '$commentCount.count',
          },
        },
      },
      {
        $unset: [...unwantedUserFields, 'comments', 'commentCount'],
      },
    ]);

    // var keyword = ['dev']
    var adload = await Post.aggregate([
      {
        $match: {
          // keywords: { $in : keyword } ,
          isAd: true
        },
      },
      { $sort: { date: -1 } },
      { $limit: 2 },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
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
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              // Finding comments related to the postId
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 3 },
            // Populating the author field
            {
              $lookup: {
                from: 'users',
                localField: 'author',
                foreignField: '_id',
                as: 'author',
              },
            },
            {
              $lookup: {
                from: 'commentvotes',
                localField: '_id',
                foreignField: 'comment',
                as: 'commentVotes',
              },
            },
            {
              $unwind: '$author',
            },
            {
              $unwind: {
                path: '$commentVotes',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unset: unwantedUserFields,
            },
            {
              $addFields: {
                commentVotes: '$commentVotes.votes',
              },
            },
          ],
          as: 'comments',
        },
      },
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            {
              $group: { _id: null, count: { $sum: 1 } },
            },
            {
              $project: {
                _id: false,
              },
            },
          ],
          as: 'commentCount',
        },
      },
      {
        $unwind: {
          path: '$commentCount',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: '$postVotes',
      },
      {
        $unwind: '$author',
      },
      {
        $addFields: {
          postVotes: '$postVotes.votes',
          commentData: {
            comments: '$comments',
            commentCount: '$commentCount.count',
          },
        },
      },
      {
        $unset: [...unwantedUserFields, 'comments', 'commentCount'],
      },
    ]);
    //   console.log(adload)
    var newad = 2;
    // console.log(posts.length)\

    var adarr = []

    adload.forEach(async (value, index, array) => {
      if (posts[posts.length - 1].isAd === undefined) {
        if (!newad < 4 || !index < 1) {
          posts.splice(newad, 0, value)
          newad += 2
        }
      }
    })

    console.log(posts.length)
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveSuggestedPosts = async (req, res, next) => {
  const { offset = 0 } = req.params;

  try {
    const posts = await Post.aggregate([
      {
        $sort: { date: -1 },
      },
      {
        $skip: Number(offset),
      },
      {
        $limit: 20,
      },
      {
        $sample: { size: 20 },
      },
      ...populatePostsPipeline,
    ]);
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

module.exports.retrieveHashtagPosts = async (req, res, next) => {
  const { hashtag, offset } = req.params;

  const query = { hashtags: hashtag }
  try {
    const posts = await Post.find(query)

    posts.forEach((post, index) => {

      console.log(post, index)
    })

    var sendposts = {
      posts: posts
    }

    return res.send(sendposts);
  } catch (err) {
    next(err);
  }
};
