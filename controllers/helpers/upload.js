const AWS = require('aws-sdk');
const s3Bucket = process.env.S3_BUCKET;

const s3 = new AWS.S3({
    accessKeyId: process.env.IAM_USER_KEY,
    secretAccessKey: process.env.IAM_USER_SECRET
});

module.exports.upload = async (dataParams, callback) => {
    s3.putObject(dataParams, async (err, data) => {
        if (err) {
            console.error(err, 'err s3');
            callback(err);
            return false;
        }
        return true;
    })
}