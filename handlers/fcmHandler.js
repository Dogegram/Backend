var admin = require("firebase-admin");
const serviceAccount = JSON.parse(process.env.FCM_CRED);
//initialize app only if none exist already
if (!admin.apps.length) {
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
}

module.exports.addUserFollowerTopic = (fcmTokens, userId) => {
    const topic = `follow-${userId}`;
    admin.messaging().subscribeToTopic(fcmTokens, topic);
}

module.exports.removeUserFollowerTopic = (fcmTokens, userId) => {
    const topic = `follow-${userId}`;
    admin.messaging().unsubscribeFromTopic(fcmTokens, topic);
}

// a function to send a message to the user topic to notice a certain user
module.exports.sendUserMessage = (user, message) => {
    const topic = `user-${user._id}`;
    admin.messaging().sendToTopic(topic, message);
}

module.exports.sendNotificationOfFollowedPostSent = (req, postObject) => {
    //use fcm to send notification
    const payload = {
        notification: {
            title: `${postObject.username} just shared a post!`,
            body: `${postObject.caption.toString()}`, 
            imageUrl: `https://bom1-storage.dogegram.xyz/${postObject.image}`,
            click_action: 'https://app.dogegram.xyz/post/' + notification.notificationData.postId,
        },
        topic: `user-${postObject.userId}`,
    };
    admin.messaging().sendMulticast(payload)
    .then((response) => {
        console.log('Successfully sent message:', response);
    }).catch((error) => {
        console.log('Error sending message:', error);
    });
}