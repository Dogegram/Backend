const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const s3Bucket = process.env.S3_BUCKET;

const s3 = new AWS.S3({
  accessKeyId: process.env.IAM_USER_KEY,
  secretAccessKey: process.env.IAM_USER_SECRET
});

const Schema = mongoose.Schema;

const PostSchema = new Schema({
  image: String,
  filter: String,
  caption: String,
  aicaption: String,
  postText: String,
  hashtags: [
    {
      type: String,
      lowercase: true,
    },
  ],
  keywords: [
    {
      type: String,
      lowercase: true,
    },
  ],
  date: {
    type: Date,
    default: Date.now,
  },
  author: {
    type: Schema.ObjectId,
    ref: 'User',
  },
  views:{
    type:Number
  }
});

PostSchema.pre('deleteOne', async function (next) {
  const postId = this.getQuery()['_id'];
  //load the post, one last time :( RIP
  try {
  const postdoc = await mongoose.model('Post').find({ _id: postId })
  const postpic = postdoc[0].image;
  console.log(postpic)
  const popularPic = await mongoose.model('Post').find({image: postpic}).limit(2)
  const s3key = postpic.replace('https://'+s3Bucket+'/', '');
  
  if(popularPic.length === 1){
    var params = {
      Bucket: s3Bucket, 
      Key: s3key,
    }
    s3.deleteObject(params).promise()
  }

    await mongoose.model('PostVote').deleteOne({ post: postId });
    await mongoose.model('Comment').deleteMany({ post: postId });
    next();
  } catch (err) {
    next(err);
  }
});

const postModel = mongoose.model('Post', PostSchema);
module.exports = postModel;
