const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcrypt');
var scrypt;
const load = async () =>{
  const crypto = require('crypto');
  scrypt = crypto.scrypt;
}
load()
const Schema = mongoose.Schema;

const RequestError = require('../errorTypes/RequestError');

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: (value) => {
      if (!validator.isEmail(value)) {
        throw new Error('Invalid email address.');
      }
    },
  },
  fullName: {
    type: String,
    required: true,
  },
  pronoun: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
    minlength: 3,
  },
  password: {
    type: String,
    minlength: 8,
  },
  avatar: String,
  bio: {
    type: String,
  },
  rawBio: {
    type: String,
  },
  ssotoken: {
    type: String,
  },
  website: {
    type: String,
    maxlength: 200,
  },
  bookmarks: [
    {
      post: {
        type: Schema.ObjectId,
        ref: 'Post',
      },
    },
  ],
  countryblocks: [
    {
      type: String,
    },
  ],
    private: {
    type: Boolean,
    default: false,
  },
  verified: {
    type: Boolean,
  },
  youtuber: {
    type: Boolean,
  },
  ytlink: {
    type: String
  },
  birthday: {
    type: Date,
  },
  banned:{
    type: Boolean
  },
  banReason:{
    type: String
  },
  pronoun:{
    type: String
  },
  secret2fa:{
    type: String
  },
  recovery2fa:[
    {
      type:String
    }
  ],
  twofactor:{
    type: Boolean
  },
  adwallet:{
    type: Number
  },
  baseAdWalletCurrency:{
    type: String
  },
  whisperEmail:{
    type: Boolean
  },
});

/*
UserSchema.pre('save', async function (next) {
  if (this.modifiedPaths().includes('password')) {
    scrypt(this.password, process.env.PASS_SALT, 64, (err, derivedKey) => {
      if (err) throw err;
      this.password = derivedKey.toString('hex');  // '3745e48...08d59ae'
      next()
    });
  } else {
    next();
  }
});*/

UserSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const document = await User.findOne({
        $or: [{ email: this.email }, { username: this.username }],
      });
      if (document)
        return next(
          new RequestError(
            'A user with that email or username already exists.',
            400
          )
        );
      await mongoose.model('Followers').create({ user: this._id });
      await mongoose.model('Following').create({ user: this._id });
    } catch (err) {
      return next((err.statusCode = 400));
    }
  }
});

const User = mongoose.model('User', UserSchema);
module.exports = User;
