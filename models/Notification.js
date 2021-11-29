const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  createdAt: {
     type: Date,
     expires: 1728000, 
     default: Date.now
    },
  sender: {
    type: Schema.ObjectId,
    ref: 'User',
  },
  receiver: {
    type: Schema.ObjectId,
    ref: 'User',
  },
  notificationType: {
    type: String,
    enum: ['follow', 'like', 'comment', 'mention', 'whisper'],
  },
  date: {
    type: Date,
    default: Date.now
  },
  notificationData: Object,
  read: {
    type: Boolean,
    default: false,
  },
});

const notificationModel = mongoose.model('notification', NotificationSchema);
module.exports = notificationModel;
