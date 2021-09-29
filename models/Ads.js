const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AdsSchema = new Schema({
  createdAt: {
    type: Date,
    default: Date.now
   },
  postbid: {
    type: 'Number'
  },
  keywords: [
    {
      type: String,
    },
  ],
  caption: {
    type: String,
  },
  imageUrl: {
    type: String,
  },
  adUsername: {
    type: String,
  },
  adcampgainname: {
    type: String,
  },
  adurl: {
    type: String,
  },
  author: {
    type: Schema.ObjectId,
    ref: 'User',
  },  
});


const adsModel = mongoose.model('Ads', AdsSchema);
module.exports = adsModel;
