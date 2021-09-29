const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ObjectId = require('mongoose').Types.ObjectId;
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const linkify = require('linkifyjs');
require('linkifyjs/plugins/mention')(linkify);
const fs = require('fs');
const sendmail = require('sendmail')({ smtpPort: 587 });

const sgMail = require('@sendgrid/mail')

sgMail.setApiKey(process.env.SENDGRID_API_KEY)


const socketHandler = require('../handlers/socketHandler');

/**
 * Retrieves a post's comments with a specified offset
 * @function retrieveComments
 * @param {string} postId The id of the post to retrieve comments from
 * @param {number} offset The amount of comments to skip
 * @returns {array} Array of comments
 */
module.exports.retrieveComments = async (postId, offset, exclude = 0) => {
  try {
    const commentsAggregation = await Comment.aggregate([
      {
        $facet: {
          comments: [
            { $match: { post: ObjectId(postId) } },
            // Sort the newest comments to the top
            { $sort: { date: -1 } },
            // Skip the comments we do not want
            // This is desireable in the even that a comment has been created
            // and stored locally, we'd not want duplicate comments
            { $skip: Number(exclude) },
            // Re-sort the comments to an ascending order
            { $sort: { date: 1 } },
            { $skip: Number(offset) },
            { $limit: 10 },
            {
              $lookup: {
                from: 'commentreplies',
                localField: '_id',
                foreignField: 'parentComment',
                as: 'commentReplies',
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
            { $unwind: '$commentVotes' },
            {
              $lookup: {
                from: 'users',
                localField: 'author',
                foreignField: '_id',
                as: 'author',
              },
            },
            { $unwind: '$author' },
            {
              $addFields: {
                commentReplies: { $size: '$commentReplies' },
                commentVotes: '$commentVotes.votes',
              },
            },
            {
              $unset: [
                'author.password',
                'author.email',
                'author.private',
                'author.bio',
                'author.bookmarks',
              ],
            },
          ],
          commentCount: [
            {
              $match: { post: ObjectId(postId) },
            },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
      {
        $unwind: '$commentCount',
      },
      {
        $addFields: {
          commentCount: '$commentCount.count',
        },
      },
    ]);
    return commentsAggregation[0];
  } catch (err) {
    throw new Error(err);
  }
};

/**
 * @function sendEmail
 * @param {string} to The destination email address
 * @param {string} subject The subject of the email
 * @param {html} template Html to include in the email
 * @param {html} name Topic Of the email
 * @param {html} sendname Email address start
 */
module.exports.sendEMail = async (to, subject, template, name, sendname) => {
 try {
  const msg = {
    to: to, 
    from: `Dogegram ${name} Team <noreply-${name}@email.dogegram.xyz>`, 
    subject: subject,
    html: template
  }
  await sgMail.send(msg);

  } catch (error) {
    console.error(error);

    if (error.response) {
      console.error(error.response.body)
    }
  }
};

/**
 * Sends a confirmation email to an email address
 * @function sendConfirmationEmail
 * @param {string} username The username of the user to send the email to
 * @param {string} email The email of the user to send the email to
 * @param {string} confirmationToken The token to use to confirm the email
 */
 module.exports.sendConfirmationEmail = async (
  username,
  email,
  confirmationToken
) => {

    try {
      const source = fs.readFileSync(
        'templates/confirmationEmail.html',
        'utf8'
      );
      let template = handlebars.compile(source);
      const html = template({
        username: username,
        confirmationUrl: `https://app.dogegram.xyz/confirm/${confirmationToken}`,
        url: "https://app.dogegram.xyz",
      });
      await this.sendEMail(email, 'Confirm your Dogegram account', html , 'Accounts', 'accounts');
    } catch (err) {
      console.log(err);
  }
};

/**
 * Sends a verification badge congoratulating email to an email address
 * @function sendVerificationBadgeEmail
 * @param {string} username The username of the user to send the email to
 * @param {string} email The email of the user to send the email to
 */
 module.exports.sendVerificationBadgeEmail = async (
  username,
  email,
) => {

    try {
      const source = fs.readFileSync(
        'templates/verificationEmail.html',
        'utf8'
      );
      let template = handlebars.compile(source);
      const html = template({
        username: username,
        url: "https://app.dogegram.xyz",
      });
      await this.sendEMail(email, 'Congrats, You Dogegram account has been verified!', html, 'Verification', 'verify');
    } catch (err) {
      console.log(err);
  }
};

/**
 * Sends a password reset email to an email address
 * @function sendVerificationBadgeEmail
 * @param {string} username The username of the user to send the email to
 * @param {string} email The email of the user to send the email to
 */
 module.exports.sendPasswordResetEmail = async (
   email,
  resetUrl,
) => {

    try {
      const source = fs.readFileSync(
        'templates/passwordResetEmail.html',
        'utf8'
      );
      let template = handlebars.compile(source);
      const html = template({
        resetUrl: resetUrl,
      });
      await this.sendEMail(email, 'Reset Your Dogegram Account Password!', html,  'Recovery', 'recovery');
    } catch (err) {
      console.log(err);
  }
};



/**
 * Sends a notification when a user has commented on your post
 * @function sendCommentNotification
 * @param {object} req The request object
 * @param {object} sender User who triggered the notification
 * @param {string} receiver Id of the user to receive the notification
 * @param {string} image Image of the post that was commented on
 * @param {string} filter The filter applied to the image
 * @param {string} message The message sent by the user
 * @param {string} postId The id of the post that was commented on
 */
module.exports.sendCommentNotification = async (
  req,
  sender,
  receiver,
  image,
  filter,
  message,
  postId
) => {
  try {
    if (String(sender._id) !== String(receiver)) {
      const notification = new Notification({
        sender: sender._id,
        receiver,
        notificationType: 'comment',
        date: Date.now(),
        notificationData: {
          postId,
          image,
          message,
          filter,
        },
      });
      await notification.save();
      socketHandler.sendNotification(req, {
        ...notification.toObject(),
        sender: {
          _id: sender._id,
          username: sender.username,
          avatar: sender.avatar,
        },
      });
    }
  } catch (err) {
    throw new Error(err.message);
  }
};


/**
 * Sends a notification to the user when the user is mentioned
 * @function sendMentionNotification
 * @param {object} req The request object
 * @param {string} message The message sent by the user
 * @param {string} image Image of the post that was commented on
 * @param {object} post The post that was commented on
 * @param {object} user User who commented on the post
 */
module.exports.sendMentionNotification = (req, message, image, post, user) => {
  const mentionedUsers = new Set();
  // Looping through every mention and sending a notification when necessary
  linkify.find(message).forEach(async (item) => {
    // Making sure a mention notification is not sent to the sender or the poster
    if (
      item.type === 'mention' &&
      item.value !== `@${user.username}` &&
      item.value !== `@${post.author.username}` &&
      // Making sure a mentioned user only gets one notification regardless
      // of how many times they are mentioned in one comment
      !mentionedUsers.has(item.value)
    ) {
      mentionedUsers.add(item.value);
      // Finding the receiving user's id
      const receiverDocument = await User.findOne({
        username: item.value.split('@')[1],
      });
      if (receiverDocument) {
        const notification = new Notification({
          sender: user._id,
          receiver: receiverDocument._id,
          notificationType: 'mention',
          date: Date.now(),
          notificationData: {
            postId: post._id,
            image,
            message,
            filter: post.filter,
          },
        });
        await notification.save();
        socketHandler.sendNotification(req, {
          ...notification.toObject(),
          sender: {
            _id: user._id,
            username: user.username,
            author: user.author,
          },
        });
      }
    }
  });
};

/**
 * Generates a unique username based on the base username
 * @function generateUniqueUsername
 * @param {string} baseUsername The first part of the username to add a random number to
 * @returns {string} Unique username
 */
module.exports.generateUniqueUsername = async (baseUsername) => {
  let uniqueUsername = undefined;
  try {
    while (!uniqueUsername) {
      const username = baseUsername + Math.floor(Math.random(1000) * 9999 + 1);
      const user = await User.findOne({ username });
      if (!user) {
        uniqueUsername = username;
      }
    }
    return uniqueUsername;
  } catch (err) {
    throw new Error(err.message);
  }
};

module.exports.populatePostsPipeline = [
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
    $lookup: {
      from: 'postvotes',
      localField: '_id',
      foreignField: 'post',
      as: 'postVotes',
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
      comments: { $size: '$comments' },
      commentReplies: { $size: '$commentReplies' },
      postVotes: { $size: '$postVotes.votes' },
    },
  },
  {
    $addFields: { comments: { $add: ['$comments', '$commentReplies'] } },
  },
  {
    $unset: [
      'commentReplies',
      'author.private',
      'author.confirmed',
      'author.githubId',
      'author.bookmarks',
      'author.password',
    ],
  },
];
