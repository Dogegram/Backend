const linkify = require('linkifyjs');
require('linkifyjs/plugins/hashtag')(linkify);
const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Following = require('../models/Following');
const Followers = require('../models/Followers');
const User = require('../models/User');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const fs = require('fs');
const ObjectId = require('mongoose').Types.ObjectId;
const fetch = require('node-fetch');
var mime = require('mime-types');
const tf = require('@tensorflow/tfjs-node');
const nsfw = require('nsfwjs');
const toxicity = require('@tensorflow-models/toxicity')
const mobilenet = require('@tensorflow-models/mobilenet')
const jwt = require('jsonwebtoken');
const sharp = require("sharp");
const crypto = require('crypto');

const AWS = require('aws-sdk');
const s3Bucket = process.env.S3_BUCKET;

const s3 = new AWS.S3({
  accessKeyId: process.env.IAM_USER_KEY,
  secretAccessKey: process.env.IAM_USER_SECRET
});
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

var model = null;
var textmodel = null;
var mobnet = null;
var innet = null;
const load_model = async () => {
  console.time("models.load")
  model = await nsfw.load()
  textmodel = await toxicity.load(0.9,['toxicity'])
  //mobnet = await mobilenet.load({version:2, alpha:1.0});
  console.timeEnd("models.load")
}

load_model();




const {
  retrieveComments,
  populatePostsPipeline,
} = require('../utils/controllerUtils');
const filters = require('../utils/filters');

module.exports.createPost = async (req, res, next) => {
  const user = res.locals.user;
  const { caption, postText, filter: filterName } = req.body; 
  let post = undefined;
  const filterObject = filters.find((filter) => filter.name === filterName);
  const hashtags = [];
  linkify.find(caption).forEach((result) => {
    if (result.type === 'hashtag') {
      hashtags.push(result.value.substring(1));
    }
    if(result.type === 'link'){

    }
  });

  if (!req.file) {
    return res
      .status(400)
      .send({ success:false, message: 'Please provide the image to upload.' });
  }



  try {
    const myfile = req.file;
    
    var fileStream = fs.createReadStream(myfile.path);
    var filename = myfile.originalname;
    console.log(filename);
    console.log(myfile.path)
    console.log("here?")
    const imagecache = fs.readFileSync(myfile.path)


  
    console.time("models.classify")
   const image = await tf.node.decodeImage(imagecache,3);
   const predictions = await model.classify(image);
   //const aitag = await mobnet.classify(image);
   const captiontoxic = await textmodel.classify(caption)
   console.timeEnd("models.classify")
   image.dispose()

   
   var nsfw = 0
 
    predictions.forEach(prediction =>{
     if(prediction.className != 'Neutral' && prediction.className != 'Drawing'&& prediction.className != 'Sexy'){
       nsfw += prediction.probability
     }
    })

    if(captiontoxic[0].results[0].match){
      fs.unlinkSync(myfile.path);
      return res.status(401).send({success:false, message:"The caption has been determined Toxic by AI (its experimental so please sorry for any inconvenience). Posting Aborted."});

    }

    if(!nsfw>0.6){
//      console.log(predictions)
    fs.unlinkSync(myfile.path);

    return res.status(401).send({success:false, message:"This file has been detected NSFW by our systems. Posting Aborted."});
    }
    console.time('img.compress')
    var compressedImage = await sharp(imagecache)
    .webp({ quality:80, speed : 8 })
    .toBuffer(); 
    console.timeEnd('img.compress')
    var tag = crypto.createHash('sha1').update(compressedImage).digest("hex"); 
    console.log(tag)

    
  const imgsize = compressedImage.toString().length;
  console.log(imgsize)
  var imagebuffer = compressedImage.toString('base64');
  var imgdata = 'data:image/avif;base64,' + imagebuffer; 

  var cdnURL = `https://${process.env.S3_BUCKET}/` + tag

  var reqCheckFile = await fetch(cdnURL)
  var resCheckFile = reqCheckFile.status
  console.log(resCheckFile)
  
  if(resCheckFile != 200){
  const params = {
    Bucket: s3Bucket,
    Key: tag, 
    Body: compressedImage,
    ACL: 'public-read',
    CacheControl:'7776000000',
    ContentType:'image/webp',
    Metadata :{
      'x-amz-acl': 'public-read'
    }
};

// Uploading files to the bucket
s3.putObject(params, async (err, data) => {
    if (err) {
        console.error(err);
    }
    console.log(`File uploaded successfully.`);
  })
}
/*
        var metadata = {
            'Content-Type': 'image/avif',a
            'Cache-Control': 23949234,
            'x-amz-acl': 'public-read'
        }     
        minioClient.putObject(minioBucketName, tag, compressedImageStream, imgsize , metadata, async function(err3, etag) {
          if (err3) {
               res.status(500).send(err3);
          }
*/


    fs.unlinkSync(myfile.path);
    post =await Post.create({
      image: cdnURL,
      filter: filterObject ? filterObject.filter : '',
      caption,
      author: user._id,
      hashtags,
      postText
    });

    console.log(post)

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
    console.log(sendata)

    sendata.image = imgdata;
    
    res.status(201).send(sendata);
 // })

      if(post != undefined){

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

    // socketHandler.sendPost(req, postObject, user._id);
    followers.forEach((follower) => {
      socketHandler.sendPost(
        req,
        // Since the post is new there is no need to look up any fields
        postObject,
        follower.user
      );
    });
  } catch (err) {
    console.log(err);
  }
};
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
    if (!postLikeUpdate.nModified) {
      if (!postLikeUpdate.ok) {
        return res.status(500).send({ error: 'Could not vote on the post.' });
      }
      // Nothing was modified in the previous query meaning that the user has already liked the post
      // Remove the user's like
      const postDislikeUpdate = await PostVote.updateOne(
        { post: postId },
        { $pull: { votes: { author: user._id } } }
      );

      if (!postDislikeUpdate.nModified) {
        return res.status(500).send({ error: 'Could not vote on the post.' });
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
      'author.pronoun',
      'author.countryblocks',
      'author.birthday',
      'author.admin'
    ];


    if(offset > 7){
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
  }

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

  adload.forEach(async (value, index, array)=>{
    if(posts[posts.length - 1].isAd === undefined){
    if(!newad < 4 || !index < 1){
      posts.splice(newad,0, value)
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
