var admin = require("firebase-admin");
const serviceAccount = require('../dogegram-firebase.json');
//initialize app only if none exist already
if (!admin.apps.length) {
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
}

const genrateMessage = (notificationType, username) => {
  switch (notificationType) {
    case 'follow': return `${username} started following you`;
    case 'like': return `${username} liked your post`;
    case 'comment': return `${username} commented on your post`;
    case 'mention': return `${username} mentioned you in a post`;
    default: `There is a of a ${notificationType} notification.`;
    }
}

module.exports.sendNotification = (req, notification) => {
  const io = req.app.get('socketio');
  //use fcm to send notification
  const payload = {
    notification: {
      title: 'Dogegram',
      body: genrateMessage(notification.notificationType, notification.sender.username), 
      icon: notification.sender.avatar,
    // now we need to open the post in the app when the notification is clicked
    click_action: 'https://app.dogegram.xyz/post/' + notification.notificationData.postId,
    },
    data: {
      postId: notification.notificationData.postId,
      notificationType: notification.notificationType,
      senderId: notification.sender._id,
      receiverId: notification.receiver._id,
      read: notification.read,
    },
    tokens: notification.receiver.fcmTokens,
  };
  msg.send(payload, function(err, response) {
    if (err) {
      console.log('Error sending message:', err);
    } else {
      console.log('Successfully sent message:', response);
    }
  });

  io.sockets.in(notification.receiver).emit('newNotification', notification);
};

module.exports.sendPost = (req, post, receiver) => {
  const io = req.app.get('socketio');
  io.sockets.in(receiver).emit('newPost', post);
};

module.exports.deletePost = (req, postId, receiver) => {
  const io = req.app.get('socketio');
  io.sockets.in(receiver).emit('deletePost', postId);
};


